---
id: 024-smartcard-pkcs11-pin-dialog
---

# ADR 024: Smartcard PKCS#11 PIN Dialog

## Status

✅ Implemented (Phase 1)

## Context

Corporate and government users authenticate to Teams with client certificates held on smartcards (national eID cards, PIV/CAC cards, YubiKeys in PIV mode). On Linux, Chromium reaches those certificates through NSS: the card is registered as a PKCS#11 module and NSS cannot read any certificate from it until the token is unlocked with a PIN.

Windows and macOS ship native PIN dialogs inside Chromium. Linux has no native UI layer for this, so Chromium exposes a callback and expects the embedding application to provide the prompt. Electron did not surface that callback for years; Electron 33 added `app.setClientCertRequestPasswordHandler`, which the repo's Electron 42 has. Until we registered a handler, smartcard-backed client-certificate authentication failed silently in Teams for Linux: NSS never received a PIN, no certificate was presented, and the user saw only a generic authentication failure with nothing to act on. Issue [#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639) reported exactly this, with a working proof-of-concept.

Before implementing, the design was validated by a spike that the reporter ran against real hardware. It established the three facts the implementation depends on. Resolving the handler's promise with an empty string does not cancel the request, it loops and re-prompts (without decrementing the card's retry counter). Rejecting the promise cleanly stops the prompting and also leaves the counter untouched. A genuinely wrong PIN sets `isRetry` on the next invocation and decrements the counter exactly once. The spike also showed that NSS calls the handler once per token unlock rather than once per request, and that NSS had already narrowed a multi-certificate card down to the single valid authentication certificate before the `select-client-certificate` event fired.

That last point matters because a smartcard's PIN budget is small (typically three to five attempts) and exhausting it hard-locks the card, requiring the PUK or reissuance. Any design that could loop a prompt or feed a wrong value back into NSS risks bricking the user's credential, so the correct cancel signal was a prerequisite, not a detail.

## Decision

Ship a Linux-only PIN dialog for PKCS#11 client certificates, gated behind `auth.clientCertificate.pinDialog.enabled` (default `false`). The PIN is collected in a separate, hardened prompt window owned by the main process and handed straight back to Electron. It is never injected into, rendered inside, or read back from the Teams web page.

### Architecture

`app/clientCertificate/index.js` registers `app.setClientCertRequestPasswordHandler` and owns the whole flow. `app/index.js` calls its `initialize()` before the main window starts loading, guarded by both `process.platform === "linux"` and the config flag, because the handler has to exist before the first TLS handshake that needs the token. The module additionally guards on platform internally and registers at most once, since the API throws a `TypeError` off Linux and would take startup down with it.

The prompt itself is `app/_shared/securePrompt.js`, a shared secret-input window extracted for this feature. It creates a `BrowserWindow` with `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`, standalone and always on top rather than modal, so it survives the parent window navigating during the login redirect chain. Display strings (heading, message, retry warning, button labels) travel outwards as `loadFile` query parameters and stay inside the dialog process. The entered secret travels back over a submit IPC channel and is returned only through the resolved promise. Submit and cancel handlers are registered exactly once and route each event to the right prompt by the sender's `webContents` id, which lets several prompts coexist without cross-talk and avoids leaking a listener per invocation.

Cancel, window close and a dialog that fails to load all reject, and `app/clientCertificate/index.js` converts that rejection into a scoped error so NSS aborts the certificate request instead of looping. A per-session cap of three submitted PINs per token guards against a runaway prompt draining the card's budget; only actual submissions count, so cancelling never accumulates, and the cap's terminal action is a rejection because that is the only response the spike proved does not touch the retry counter. When `isRetry` is set, the dialog says the previous PIN was wrong and warns that repeated failures can permanently lock the card.

Per the repo's PII rules, `hostname` and `tokenName` may identify the user's employer or card issuer, so they appear in the dialog only and never in logs. The PIN itself is never logged, never written to disk and never persisted in config.

### Rationale

The security boundary is the point of this ADR. A smartcard PIN is not a website password: it unlocks a hardware credential that typically also signs and decrypts, and spending its retry budget destroys the credential rather than just failing a login. The Teams page is third-party code that Microsoft ships and changes without notice, running with `contextIsolation: false` so that our own browser tools can work against it, which means anything rendered or typed inside that page is reachable by page script and by whatever third-party script the page loads. Collecting the PIN in a main-process-owned window keeps it entirely outside the renderer that hosts untrusted code: the page cannot read the field, cannot observe the value, and cannot forge the prompt against the same window chrome.

The timing reinforces the same conclusion. The PIN request fires during a TLS handshake, frequently mid-navigation in the Microsoft login redirect chain, when there is no stable Teams document to inject into at all. The one mechanism that is both safe and available is a separate window.

Extracting `app/_shared/securePrompt.js` rather than copying the shipped WebAuthn PIN dialog was a deliberate security call. Two copies of a secret-input dialog means two sets of IPC wiring, preload scripts and window options that can drift, and a hardening fix applied to one can silently miss the other. There is now one implementation going forward, with the already-shipped WebAuthn dialog migrating onto it opportunistically rather than a second copy being created.

Shipping off by default and Linux only follows the WebAuthn precedent (ADR-021). Users who do not opt in see no behaviour change, and on macOS and Windows the feature is simply absent because Chromium already provides native PIN prompts there.

## Alternatives Considered

### In-page PIN entry via injection into the Teams DOM

The most "integrated" looking option, rendering the PIN field inside the Teams page through a browser tool in `app/browser/tools/`. This is the same shape as the WebAuthn module's dom-inject strategy, which was built and then removed for precisely this reason. The Teams page runs with `contextIsolation: false`, so a field injected there is readable by page script and by any third-party script the page loads, and the prompt would be indistinguishable from one the page itself could fabricate. Handing a hardware credential's unlock secret to a document we do not control is not a trade-off worth making at any UX benefit. The trigger timing rules it out independently, since the handshake often happens with no Teams document loaded.

Rejected: it would expose a hardware token PIN to third-party page script in a context we do not control.

### Relying on the system PKCS#11 helper or middleware to prompt

Assumes something below us (p11-kit, OpenSC, pinentry, or the desktop's own agent) will ask for the PIN when NSS needs it. On Linux it does not. Chromium delegates the prompt to the embedder by design, which is why the callback exists at all, and the observed behaviour before this change was a silent failure rather than any system prompt. There is no configuration of the middleware that makes an external prompt appear for this code path.

Rejected: no system-level prompt exists for the NSS client-certificate path on Linux, which is the whole cause of the bug.

### Modal child window parented to the main window

The existing `app/_shared/createDialogWindow.js` scaffolding used by Add Profile and Join Meeting is the right kind of surface, but the wrong modality for this trigger. A modal parented to a window that is actively navigating flashes and closes during page transitions, which is the failure mode already hit during the WebAuthn work, and the client-certificate PIN request fires exactly in the middle of the login redirect chain.

Rejected: a modal attached to a navigating parent is dismissed by the navigation before the user can type.

### Frameless styled toast

The `app/incomingCallToast/` and `app/notificationSystem/` windows are frameless and always on top, and they are what makes app UI feel native. They are fine for notices and wrong for secret input, because a frameless window with no chrome and no title gives the user nothing to check the prompt's origin against, which is precisely the check that matters before typing a PIN.

Rejected: a chromeless surface offers no way for the user to verify what is asking for their PIN.

### Empty-string resolve as the cancel signal

The obvious way to express "the user cancelled" is to resolve the handler's promise with an empty string. The spike proved this wrong: NSS treats it as an unusable answer and re-prompts in a loop rather than aborting, which is both a broken user experience and a route to a prompt storm. Rejecting is the response that stops NSS cleanly without touching the card's retry counter.

Rejected: an empty-string resolve loops instead of cancelling, so cancel and the safety cap both reject.

### Copying the WebAuthn PIN dialog instead of extracting a shared helper

An earlier draft favoured copy-then-unify, leaving the shipped WebAuthn beta untouched and extracting a common helper only once a second consumer existed. Review pushed back, correctly. Duplicating the IPC wiring and window hardening of a secret-input dialog creates a window in which a security fix lands on one copy and is missed on the other, on exactly the surface where drift is least acceptable.

Rejected: duplicating a secret-input dialog invites security drift between the copies.

## Consequences

### Positive

Linux users with smartcard-backed client certificates can now authenticate to Teams, where previously the attempt failed silently with no actionable error. The PIN never enters the Teams renderer, so no page script or third-party script loaded by Teams can observe it. The per-session attempt cap and the reject-on-cancel semantics mean the app cannot drain a card's PIN budget through a prompt loop, which was the worst realistic outcome of getting this wrong. `app/_shared/securePrompt.js` gives the growing family of authentication prompts a single audited window implementation to build on.

### Negative

The feature is off by default, so affected users have to discover `auth.clientCertificate.pinDialog.enabled` and restart before they get any benefit, and the failure they hit without it is still the same silent one. Once the per-session cap is reached for a token, the only way to try again is to restart the application, which is deliberate but blunt. Teams for Linux now owns a security-sensitive input surface whose hardening properties (context isolation, sandbox, no node integration, secret only through the resolved promise) must not regress in future refactors.

### Known limitations

- Phase 2, the `select-client-certificate` picker for tokens exposing more than one usable certificate, is not shipped. The spike showed NSS already narrows to the single valid authentication certificate on the reporter's card, so Electron's default first-certificate behaviour is adequate for the common case. Cards that genuinely present several valid authentication certificates will still get whichever one NSS offers first.
- Phase 3 polish is not done: the flag is still off by default pending wider validation, and the shipped WebAuthn PIN dialog has not yet been migrated onto `app/_shared/securePrompt.js`.
- The attempt cap is per token per session and only resets on restart; there is no in-app way to clear it.
- Whether the same handler also services NSS internal key store (nssdb master password) prompts, and whether the dialog wording should differ if it does, has not been confirmed.
- macOS and Windows are unaffected by design. The handler is never registered there, so the feature cannot be tested on those platforms or on non-Linux CI runners.
- Configuring the PKCS#11 module itself (OpenSC, `modutil`, p11-kit) remains the user's responsibility; the wrapper takes no position on which middleware sits below NSS.

## References

- [#2639 feature request](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639)
- [PR #2659 Phase 1 implementation](https://github.com/IsmaelMartinez/teams-for-linux/pull/2659)
- `app/clientCertificate/index.js`: the PIN handler, platform guard and per-token attempt cap
- `app/_shared/securePrompt.js`: the shared hardened secret-input window
- `app/config/options.js`: `auth.clientCertificate.pinDialog.enabled`, default `false`, Linux only
- [Electron `app.setClientCertRequestPasswordHandler` docs](https://www.electronjs.org/docs/latest/api/app#appsetclientcertrequestpasswordhandlerhandler-linux) and [electron/electron#41205](https://github.com/electron/electron/pull/41205)
- [ADR 021: WebAuthn / FIDO2 Hardware Security Keys on Linux](./021-webauthn-fido2-linux.md), the opt-in beta precedent and the PIN window pattern this generalises
- [ADR 013: PII Log Sanitisation](./013-pii-log-sanitization.md), which governs keeping `hostname` and `tokenName` out of logs
- Research history: see git history for `docs-site/docs/development/research/smartcard-nss-pin-dialog-research.md`

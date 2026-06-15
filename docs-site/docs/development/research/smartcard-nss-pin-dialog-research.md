# Smartcard / NSS PIN Dialog for Client-Certificate Authentication (Issue #2639)

:::info Research Context
Issue [#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639) requests support for password-protected NSS cryptographic providers — most importantly smartcards exposed through PKCS#11 — by implementing the PIN dialog that Chromium delegates to the application on Linux. This document captures the feasibility analysis, the relevant Electron APIs, how the feature fits the existing codebase, and a phased implementation recommendation.
:::

Date: 2026-06-09
Issue: [#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639)
Status: Validated against real hardware (spike, 2026-06-15); Phase 1 (PIN dialog) implemented

## Background

Corporate and government users authenticate to Teams with client certificates stored on smartcards (eID cards, PIV/CAC cards, YubiKey PIV, etc.). On Linux, Chromium reaches these through NSS: the card is registered as a PKCS#11 module (typically under `/etc/pkcs11/modules/` or in an `nssdb` profile), and NSS cannot read the certificates until the token is unlocked with a PIN.

On Windows and macOS, Chromium ships native PIN dialogs. On Linux there is no native UI layer, so Chromium exposes a callback and expects the embedding application to provide the dialog. Electron did not surface that callback for years; Electron 33 added it via [`app.setClientCertRequestPasswordHandler`](https://www.electronjs.org/docs/latest/api/app#appsetclientcertrequestpasswordhandlerhandler-linux) ([electron/electron#41205](https://github.com/electron/electron/pull/41205)). Without it, smartcard-backed client-certificate auth in Teams for Linux fails silently: NSS never gets the PIN, the certificate is never presented, and the user sees a generic auth failure.

The reporter provided a working proof-of-concept gist (drop-in Electron main file) demonstrating both the PIN handler and certificate selection against the test page `https://prod.idrix.eu/secure/`.

## What Electron provides

Two APIs are relevant, and the repo's Electron 42.3.3 has both.

**`app.setClientCertRequestPasswordHandler(handler)`** (Linux only, Electron ≥ 33). The handler is called whenever NSS needs a password to unlock a client certificate. It receives `{ hostname, tokenName, isRetry }` — the site requesting the certificate, the PKCS#11 token (slot) name, and whether a previous attempt failed — and must return a `Promise<string>` resolving to the password/PIN. This is the missing piece for password-protected providers.

**`select-client-certificate` app event.** Emitted when a server requests a client certificate and more than one is available. Without a listener, Electron auto-selects the first certificate from the store. Teams for Linux currently has no listener, which is fine for the single-cert PKCS#12 path but wrong for smartcards: eID cards routinely carry multiple certificates (authentication vs. signature), and picking the wrong one fails enrollment-specific policies. Calling `event.preventDefault()` and invoking the callback with a user-chosen entry fixes this.

## Current state in this codebase

Client-certificate support today is limited to file-based PKCS#12: `clientCertPath` / `clientCertPassword` (flat config options in `app/config/options.js`) feed `app.importCertificate(...)` in `applyAppConfiguration` (`app/mainAppWindow/index.js`). That API imports into the NSS database on Linux — it does not help with hardware tokens, and the password travels through a plaintext config option.

`app/certificate/index.js` handles a different concern (custom CA fingerprint allow-listing for `certificate-error` events) and is wired in `app/index.js` via `app.on("certificate-error", ...)`.

Two existing dialog patterns are directly relevant:

- `app/webauthn/pinDialog.js` (ADR-021) is a hardened, promise-based PIN-entry `BrowserWindow`: `contextIsolation: true`, `sandbox: true`, no node integration, IPC submit/cancel channels, settled-flag race protection, and a pre-collect (standalone always-on-top) variant that avoids modal-flash issues during page navigation. This is almost exactly the window #2639 needs.
- `app/login/index.js` shows the module-level single-listener IPC registration pattern used for modal credential dialogs.

The repo's PII logging rules matter here: `hostname` and `tokenName` may identify the user's employer or smartcard issuer and must not be logged; the PIN must never touch any log or config file and should live only in the promise resolution passed back to Electron.

## Proposed design

A new `app/clientCertificate/` module (or an extension of `app/certificate/` — see open questions) owning both halves of the flow:

**PIN handler (the core of #2639).** Register `app.setClientCertRequestPasswordHandler` early in startup — before the main window begins loading, since the handler must exist before the first TLS handshake that needs the token. The handler opens a PIN window modeled on `app/webauthn/pinDialog.js`'s pre-collect strategy (standalone, always-on-top, isolated context) showing the token name and requesting hostname *in the dialog only* (never in logs). Resolve the promise with the entered PIN.

**Platform guard (mandatory).** `app.setClientCertRequestPasswordHandler` is a Linux-only method; calling it on macOS or Windows throws a `TypeError` and would crash startup. The registration must be guarded with `process.platform === "linux"` (the codebase already branches on `process.platform` elsewhere). On non-Linux platforms the feature is simply absent — acceptable, since native PIN dialogs exist there. The new module should no-op cleanly rather than registering anything off-Linux, and any tests must stub or skip the registration on non-Linux CI runners.

**Retry and lockout safety.** Smartcards typically hard-lock after 3 wrong PINs, and unlocking requires the PUK or reissuance — a much worse failure than a cancelled login. When `isRetry` is true the dialog must say so explicitly ("Previous PIN was incorrect") and should display a prominent warning that repeated failures can permanently lock the card. The PoC gist simply killed the process on retry as a development safety; production should instead let the user decide, but a belt-and-braces cap (e.g. refuse to prompt more than twice per token per session, requiring an app restart to try again) is cheap insurance against a prompt loop draining all three attempts. The exact retry semantics (does NSS re-invoke the handler immediately? per request or per token?) is a spike question.

A subtle trap, flagged in review: the safety cap must not *itself* cause a lockout. If, when the cap is hit, the handler rejects the promise or resolves with an empty string, NSS may interpret that as another wrong-PIN attempt and decrement the card's retry counter anyway — the opposite of the intended protection. So "how does NSS treat a rejected promise vs. an empty-string resolve, and does either consume a PIN attempt?" is a hard prerequisite of the spike (it overlaps with the Cancel-semantics question below). The cap's terminal action must be whichever response the spike proves does *not* touch the counter; if neither is safe, the cap has to stop re-invoking by some other means (e.g. surfacing a "card locked out for this session — restart to retry" notice without ever calling back into NSS).

**Cancel semantics.** What cancellation should return is not documented — resolving with an empty string, or rejecting the promise, are both candidates and their NSS-side behavior differs (empty string likely counts as a wrong-PIN attempt, which matters for the lockout budget). This must be answered by the spike before the dialog's Cancel button can be wired safely.

**Certificate picker (phase 2).** An `app.on("select-client-certificate", ...)` listener that calls `event.preventDefault()` and, when `certificateList.length > 1`, shows a chooser dialog (subject, issuer, validity) and returns the selection via the callback. When only one certificate is available, pass it through without UI. This is separable from the PIN work — Electron's default first-certificate behavior remains for phase 1 — but eID-style cards will need it for a complete experience.

The `select-client-certificate` event hands the listener the requesting `webContents`. Because the app now supports multi-account profiles (ADR-020), the picker must be parented to the *specific* window that triggered the request via `BrowserWindow.fromWebContents(webContents)`, not to a globally-tracked "main" window — otherwise, with two profile windows open, the certificate prompt could attach to the wrong one and a user could unknowingly pick a certificate for the wrong account. The PIN handler does not receive a `webContents` (only `{ hostname, tokenName, isRetry }`), which is partly why its standalone always-on-top window is the right call there; the picker, by contrast, *can and should* be properly parented.

**Configuration.** Following the repo's incremental-nested-config principle and the WebAuthn precedent (opt-in beta behind `auth.webauthn.enabled`), gate the feature behind `auth.clientCertificate.pinDialog.enabled` (default `false`) for the first release, flipping the default to `true` once the requester confirms it works. Rationale for eventually defaulting on: the handler only fires when NSS actually needs a token password, so for users without protected tokens it is inert; today's behavior (silent failure) is strictly worse than a dialog. The existing flat `clientCertPath`/`clientCertPassword` options stay as-is and migrate opportunistically later.

**Out of scope.** Configuring the PKCS#11 module itself (modutil/p11-kit setup, OpenSC installation) remains the user's responsibility — the wrapper has no opinion about which middleware sits below NSS, mirroring the `customBackground` philosophy. A documentation page should cover the typical OpenSC + `modutil` setup and link distro guides.

## UI integration feasibility

"Integrating with the Teams for Linux UI" can mean four different things, and the codebase already contains an example of each:

1. **In-page DOM injection** (`app/browser/tools/` scripts rendering UI inside the Teams page). Ruled out for PIN entry on two independent grounds. Security: the Teams page runs with `contextIsolation: false`, so anything injected there is readable by page and third-party scripts — this is exactly why the WebAuthn module's Strategy B (dom-inject) was built and then removed (`app/webauthn/pinDialog.js` header documents the removal). Timing: the client-cert PIN request fires during a TLS handshake, often mid-navigation in the login redirect chain, when the Teams SPA is not loaded and there is no stable document to inject into.
2. **Modal child window attached to the main window** (`app/_shared/createDialogWindow.js`, used by Add Profile and Join Meeting). Right scaffolding, wrong modality for this trigger: a modal parented to a window that is actively navigating is the WebAuthn "Strategy C" failure mode (dialog flashes and closes during page transitions). The handshake-time trigger makes this likely here.
3. **Standalone always-on-top window** (WebAuthn pinDialog "Strategy A"). Survives parent navigation, isolated context, proven in the FIDO2 beta. This is the right *mechanism*, but today it looks bare — a framed default window with no app styling.
4. **Frameless styled toast** (`app/incomingCallToast/`, `app/notificationSystem/` — frameless, `alwaysOnTop`, `skipTaskbar`, positioned via `app/utils/windowPositioner`). These are what make UI "feel" native to the app. Fine for notices; wrong for secret input, because a frameless window with no chrome gives the user nothing to verify the prompt's origin against, and PIN entry deserves a recognizable window.

Recommendation: a standalone window (option 3 semantics) built on a small generalization of `createDialogWindow` (allow `modal: false` + `alwaysOnTop`), sharing the visual language of the existing dialogs (app icon, same CSS as `app/login/login.html` / the profile dialogs) so it reads as a Teams for Linux surface rather than a naked Chromium window. Deeper integration than that — rendering inside the Teams page — is not feasible for secret input and should not be attempted. The phase-2 certificate picker has the same handshake-time trigger, so the same standalone-window reasoning applies to it.

## Overlap with the FIDO2 prompt work (#2631 / #2634)

This feature is the third entry in what is becoming a family of authentication prompts, and they should converge rather than accumulate:

| Prompt | Status | Input | Lifecycle |
|---|---|---|---|
| WebAuthn security-key PIN (`app/webauthn/pinDialog.js`) | Shipped (beta) | Secret (password field) | Settled by user (submit/cancel) |
| FIDO2 touch prompt ([#2631](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631), feasibility note [PR #2634](https://github.com/IsmaelMartinez/teams-for-linux/pull/2634)) | Researched | None (notice only) | Dismissed programmatically when the backend call returns |
| Smartcard/NSS PIN (this document) | Researched | Secret + retry/lockout warning | Settled by user |
| Certificate picker (phase 2, this document) | Proposed | List selection | Settled by user |

All four share the same skeleton: hardened window (`contextIsolation`, `sandbox`, no node integration), promise-based resolution, submit/cancel IPC wiring with settled-flag race protection, and the standalone always-on-top behavior required during auth flows. They differ only in body content (password field vs. static notice vs. list), whether the user or the caller settles the promise, and messaging (the smartcard dialog needs `isRetry` lockout warnings; the touch prompt needs auto-dismiss).

An earlier draft of this document leaned copy-then-unify (the first feature copies the WebAuthn pattern, the second extracts a shared helper) to keep the shipped beta untouched. Review feedback pushed back on that, correctly: copying the IPC wiring, preload scripts, and HTML/CSS of a **secret-input** dialog creates a duplication window in which a security fix applied to one copy can be missed in the other — security drift on exactly the kind of surface where it matters most. That risk outweighs the convenience of not building an abstraction up front.

Revised plan: the **first** of these features to be implemented (#2631 or #2639) builds the shared secure-prompt helper under `app/_shared/` from the start — a sibling or extension of `createDialogWindow`, parameterized by mode (`password-entry`, `notice`, `list-select`) — and consumes it rather than copying `pinDialog.js`. No new duplication is ever created. The one piece deliberately left for later is migrating the already-shipped WebAuthn `pinDialog.js` onto the helper: that is an opportunistic follow-up, not on either feature's critical path, so the live beta is refactored only when there's a reason to touch it — but crucially there is only ever *one* copy going forward, not two diverging ones. This also matters for UX coherence: a YubiKey used in PIV mode is *both* a smartcard and a FIDO2 authenticator, so one user can plausibly see all of these prompts in a single sign-in and they should look like the same application asking.

## Validation without hardware

The maintainer does not need a physical smartcard to develop this. [SoftHSM2](https://github.com/softhsm/SoftHSMv2) provides a software PKCS#11 token: initialize a token with a user PIN, load a test client certificate + key into it via `pkcs11-tool`, register the SoftHSM library in the Chromium NSS database (`modutil -dbdir sql:$HOME/.pki/nssdb -add softhsm -libfile /usr/lib/softhsm/libsofthsm2.so`), and point the app at a client-cert test endpoint such as `https://prod.idrix.eu/secure/` (used by the reporter) or a local nginx with `ssl_verify_client on`. This setup answers every spike question (handler firing, retry semantics, cancel behavior, interaction with `select-client-certificate`) reproducibly in CI-less local testing. Final confirmation on real hardware comes from the requester, who has the smartcard environment and has offered to test.

## Spike script and reporter validation protocol

The maintainer's environment has no smartcard and no display for an interactive Electron session, so the spike is packaged as a runnable script for anyone with the right setup — primarily the issue reporter, who offered to test: [`testing/spikes/smartcard-pin-spike/main.mjs`](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/testing/spikes/smartcard-pin-spike/main.mjs). It is a standalone Electron main script (no Teams for Linux app code involved) that registers both the PIN handler and a `select-client-certificate` listener with verbose logging, and offers three settle paths in the PIN window — **Submit**, **Cancel → `resolve("")`**, **Cancel → `reject()`** — so each spike question maps to a button press plus a counter check.

Run from a repo checkout:

```bash
npm install
npx electron testing/spikes/smartcard-pin-spike/main.mjs            # defaults to https://prod.idrix.eu/secure/
npx electron testing/spikes/smartcard-pin-spike/main.mjs <other-url>
```

**Safety rule:** the cancel and wrong-PIN experiments must run against a SoftHSM2 token or a disposable test card, never a production card — the whole point is to find out whether these paths decrement the card's retry counter. Check remaining attempts with the middleware (e.g. `pkcs11-tool --module <lib> --login --test`) before and after *each* experiment so every decrement can be attributed. On a real card, only the happy path (correct PIN first try) and the read-only observations (does the handler fire, is `tokenName` right) are safe to test.

Questions the spike answers, in order:

1. Does the handler fire at all in an Electron 42 session, and is `tokenName` the expected PKCS#11 token?
2. Does `resolve("")` cause a re-invocation with `isRetry: true`, and does it decrement the attempts counter?
3. Does `reject()` differ from `resolve("")` in either respect?
4. After a deliberately wrong PIN: is the next invocation `isRetry: true`, and (on the test token) does the counter decrement exactly once?
5. Cadence: reload the page — does the handler fire per request or once per token unlock?
6. Does `select-client-certificate` fire, and what does `certificateList` contain for a multi-cert token?
7. End-to-end: after a correct PIN, does the test page render the certificate details?

The reporter's answers get recorded in this document and convert the implementation from "designed" to "validated design". SoftHSM2 setup for anyone reproducing locally:

```bash
sudo apt install softhsm2 opensc                      # or distro equivalent
softhsm2-util --init-token --free --label spike --so-pin 0102030405060708 --pin 123456
# generate a throwaway client cert and import key+cert into the token
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 30 -nodes -subj "/CN=spike"
openssl pkcs8 -topk8 -inform PEM -outform DER -in key.pem -out key.der -nocrypt
openssl x509 -in cert.pem -outform DER -out cert.der
pkcs11-tool --module /usr/lib/softhsm/libsofthsm2.so -l --pin 123456 --write-object key.der  --type privkey --label spike
pkcs11-tool --module /usr/lib/softhsm/libsofthsm2.so -l --pin 123456 --write-object cert.der --type cert    --label spike
# make the token visible to Chromium/Electron's NSS database
modutil -dbdir sql:$HOME/.pki/nssdb -add softhsm -libfile /usr/lib/softhsm/libsofthsm2.so
```

(Paths vary by distro — `libsofthsm2.so` may live under `/usr/lib/x86_64-linux-gnu/softhsm/`. The test endpoint accepts any certificate, including self-signed, and reflects back what was presented.)

## Spike results (validated 2026-06-15)

The reporter ran the spike against a real smartcard (PIN retry budget of 5) and confirmed the design. Answers in the order the questions were asked:

1. The handler fires and `tokenName` is the expected PKCS#11 token.
2. `resolve("")` re-prompts but, surprisingly, with `isRetry` still `false`, and it does not decrement the retry counter. An empty-string resolve does not cancel the request, it loops.
3. `reject()` differs: it stops the prompting. In the spike it surfaced as an `UnhandledPromiseRejectionWarning` because the spike returned the rejected promise uncaught; the production handler catches the cancel and rethrows a scoped error.
4. After a deliberately wrong PIN the next call has `isRetry: true` and the counter drops by exactly one.
5. Reload and force-reload did not trigger a new prompt, so the handler fires once per token unlock, not per request.
6. `select-client-certificate` fired with a single entry: NSS had already filtered the card's certificates by `keyUsage` and offered only the valid authentication certificate. The card also carries signing and encryption certificates, but only the valid authentication one reached the listener.
7. After the correct PIN the test page rendered the certificate.

Decisions these drove for Phase 1: Cancel rejects (not empty-string resolve, which loops), and the per-session safety cap also rejects, since reject is the only response proven not to touch the retry counter. Because NSS narrows to the single valid certificate, the certificate picker (Phase 2) is not needed for the common case and is deferred. The handler runs once per unlock, so there is no repeated-prompt concern during normal navigation.

The spike's ESM top-level-await harness did not run on the reporter's Node 26 setup and was switched to CommonJS to test; this is a spike-harness quirk and does not affect the app.

## Phased plan

1. **Spike (small, SoftHSM2-based):** confirm the handler fires in our window/session setup, determine cancel and retry semantics, and verify whether the handler also services nssdb master-password prompts. Outcome recorded in this document.
2. **Phase 1 — PIN dialog:** `app/clientCertificate/` module with the handler + secure PIN window (reusing/extracting the WebAuthn dialog pattern), `auth.clientCertificate.pinDialog.enabled` opt-in config, README, configuration docs, and a troubleshooting/setup page for PKCS#11 modules. Requester validates on real hardware.
3. **Phase 2 — certificate picker:** `select-client-certificate` chooser dialog for multi-certificate tokens. Ship when phase 1 feedback confirms demand (the requester's scenario may already need it — ask during validation).
4. **Phase 3 — polish:** consider defaulting the PIN dialog on, completing the shared-prompt convergence described in the overlap section (including migrating the WebAuthn pinDialog), and an ADR if the feature graduates from beta.

## Open questions

- Cancel semantics: empty-string resolve vs. promise rejection, and whether either burns a PIN attempt (spike).
- Retry cadence: whether NSS re-invokes the handler per TLS request or per token unlock, and how a per-session prompt cap should reset (spike).
- Does the same handler fire for the NSS internal key store (nssdb master password), and if so should the dialog wording differ? (spike)
- Module placement: new `app/clientCertificate/` vs. widening `app/certificate/`. Leaning new module — the existing one is about server-cert trust, a different concern, and single-responsibility favors separation.
- Implementation order relative to the FIDO2 touch prompt (#2631): whichever lands **first** builds the shared `app/_shared/` prompt helper (see overlap section); migrating the shipped WebAuthn `pinDialog.js` onto it is a later opportunistic follow-up. Both features are small; the order is a prioritization call.

## Related

- Issue [#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639) — feature request with PoC gist
- [Electron `app.setClientCertRequestPasswordHandler` docs](https://www.electronjs.org/docs/latest/api/app#appsetclientcertrequestpasswordhandlerhandler-linux) / [electron/electron#41205](https://github.com/electron/electron/pull/41205)
- [Reporter's proof-of-concept gist](https://gist.github.com/agemuend/8fd859ee074517188744f8c6fc11c9a4)
- `app/webauthn/pinDialog.js` and [ADR-021](../adr/021-webauthn-fido2-linux.md) — secure PIN window pattern and opt-in beta precedent
- Issue [#2631](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631) / [PR #2634](https://github.com/IsmaelMartinez/teams-for-linux/pull/2634) — FIDO2 touch prompt, the sibling prompt this should share UI infrastructure with
- `app/_shared/createDialogWindow.js` — existing shared dialog scaffolding, candidate base for the shared prompt helper
- [WebAuthn / FIDO2 Implementation Plan](webauthn-fido2-implementation-plan.md) — adjacent hardware-authenticator work
- [Configuration Organization Research](configuration-organization-research.md) — nested config pattern for new options

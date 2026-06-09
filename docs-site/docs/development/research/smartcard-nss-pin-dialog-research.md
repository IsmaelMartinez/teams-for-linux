# Smartcard / NSS PIN Dialog for Client-Certificate Authentication (Issue #2639)

:::info Research Context
Issue [#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639) requests support for password-protected NSS cryptographic providers — most importantly smartcards exposed through PKCS#11 — by implementing the PIN dialog that Chromium delegates to the application on Linux. This document captures the feasibility analysis, the relevant Electron APIs, how the feature fits the existing codebase, and a phased implementation recommendation.
:::

Date: 2026-06-09
Issue: [#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639)
Status: Research complete; small SoftHSM2 spike recommended before implementation

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

**Retry and lockout safety.** Smartcards typically hard-lock after 3 wrong PINs, and unlocking requires the PUK or reissuance — a much worse failure than a cancelled login. When `isRetry` is true the dialog must say so explicitly ("Previous PIN was incorrect") and should display a prominent warning that repeated failures can permanently lock the card. The PoC gist simply killed the process on retry as a development safety; production should instead let the user decide, but a belt-and-braces cap (e.g. refuse to prompt more than twice per token per session, requiring an app restart to try again) is cheap insurance against a prompt loop draining all three attempts. The exact retry semantics (does NSS re-invoke the handler immediately? per request or per token?) is a spike question.

**Cancel semantics.** What cancellation should return is not documented — resolving with an empty string, or rejecting the promise, are both candidates and their NSS-side behavior differs (empty string likely counts as a wrong-PIN attempt, which matters for the lockout budget). This must be answered by the spike before the dialog's Cancel button can be wired safely.

**Certificate picker (phase 2).** An `app.on("select-client-certificate", ...)` listener that calls `event.preventDefault()` and, when `certificateList.length > 1`, shows a chooser dialog (subject, issuer, validity) and returns the selection via the callback. When only one certificate is available, pass it through without UI. This is separable from the PIN work — Electron's default first-certificate behavior remains for phase 1 — but eID-style cards will need it for a complete experience.

**Configuration.** Following the repo's incremental-nested-config principle and the WebAuthn precedent (opt-in beta behind `auth.webauthn.enabled`), gate the feature behind `auth.clientCertificate.pinDialog.enabled` (default `false`) for the first release, flipping the default to `true` once the requester confirms it works. Rationale for eventually defaulting on: the handler only fires when NSS actually needs a token password, so for users without protected tokens it is inert; today's behavior (silent failure) is strictly worse than a dialog. The existing flat `clientCertPath`/`clientCertPassword` options stay as-is and migrate opportunistically later.

**Out of scope.** Configuring the PKCS#11 module itself (modutil/p11-kit setup, OpenSC installation) remains the user's responsibility — the wrapper has no opinion about which middleware sits below NSS, mirroring the `customBackground` philosophy. A documentation page should cover the typical OpenSC + `modutil` setup and link distro guides.

## Validation without hardware

The maintainer does not need a physical smartcard to develop this. [SoftHSM2](https://github.com/softhsm/SoftHSMv2) provides a software PKCS#11 token: initialize a token with a user PIN, load a test client certificate + key into it via `pkcs11-tool`, register the SoftHSM library in the Chromium NSS database (`modutil -dbdir sql:$HOME/.pki/nssdb -add softhsm -libfile /usr/lib/softhsm/libsofthsm2.so`), and point the app at a client-cert test endpoint such as `https://prod.idrix.eu/secure/` (used by the reporter) or a local nginx with `ssl_verify_client on`. This setup answers every spike question (handler firing, retry semantics, cancel behavior, interaction with `select-client-certificate`) reproducibly in CI-less local testing. Final confirmation on real hardware comes from the requester, who has the smartcard environment and has offered to test.

## Phased plan

1. **Spike (small, SoftHSM2-based):** confirm the handler fires in our window/session setup, determine cancel and retry semantics, and verify whether the handler also services nssdb master-password prompts. Outcome recorded in this document.
2. **Phase 1 — PIN dialog:** `app/clientCertificate/` module with the handler + secure PIN window (reusing/extracting the WebAuthn dialog pattern), `auth.clientCertificate.pinDialog.enabled` opt-in config, README, configuration docs, and a troubleshooting/setup page for PKCS#11 modules. Requester validates on real hardware.
3. **Phase 2 — certificate picker:** `select-client-certificate` chooser dialog for multi-certificate tokens. Ship when phase 1 feedback confirms demand (the requester's scenario may already need it — ask during validation).
4. **Phase 3 — polish:** consider defaulting the PIN dialog on, extracting a shared secure-prompt helper used by both WebAuthn and client-cert dialogs, and an ADR if the feature graduates from beta.

## Open questions

- Cancel semantics: empty-string resolve vs. promise rejection, and whether either burns a PIN attempt (spike).
- Retry cadence: whether NSS re-invokes the handler per TLS request or per token unlock, and how a per-session prompt cap should reset (spike).
- Does the same handler fire for the NSS internal key store (nssdb master password), and if so should the dialog wording differ? (spike)
- Module placement: new `app/clientCertificate/` vs. widening `app/certificate/`. Leaning new module — the existing one is about server-cert trust, a different concern, and single-responsibility favors separation.
- Whether the WebAuthn PIN dialog should be generalized into a shared helper now or copied and unified later. Leaning copy-then-unify to keep the WebAuthn beta untouched.

## Related

- Issue [#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639) — feature request with PoC gist
- [Electron `app.setClientCertRequestPasswordHandler` docs](https://www.electronjs.org/docs/latest/api/app#appsetclientcertrequestpasswordhandlerhandler-linux) / [electron/electron#41205](https://github.com/electron/electron/pull/41205)
- [Reporter's proof-of-concept gist](https://gist.github.com/agemuend/8fd859ee074517188744f8c6fc11c9a4)
- `app/webauthn/pinDialog.js` and [ADR-021](../adr/021-webauthn-fido2-linux.md) — secure PIN window pattern and opt-in beta precedent
- [WebAuthn / FIDO2 Implementation Plan](webauthn-fido2-implementation-plan.md) — adjacent hardware-authenticator work
- [Configuration Organization Research](configuration-organization-research.md) — nested config pattern for new options

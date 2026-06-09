# FIDO2 Touch Prompt UI (Issue #2631)

:::info Feasibility Research
Feasibility explored, not yet scheduled. FIDO2 / WebAuthn support is an opt-in beta behind `auth.webauthn.enabled` (see [ADR-021](../adr/021-webauthn-fido2-linux.md)).
:::

**Date**: 2026-06-09
**Issue**: [#2631 - FIDO2: missing UI prompt when waiting for authenticator touch](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631)
**Status**: Research / feasibility (treated as an enhancement, not a regression)

## Summary

[#2631](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631) reports that while the authenticator waits for a physical touch (the user-presence check), Teams for Linux shows no on-screen prompt, so the app appears frozen. This is a missing-UX gap in the opt-in FIDO2 beta, not a regression: authentication completes correctly if the user knows to touch the key. Adding a "touch your security key now" prompt is feasible and low-risk, with one honest limitation, namely that we can show the prompt for the duration of the security-key call but cannot pinpoint the exact instant the key starts waiting for touch.

## Current behaviour

A security-key assertion from the Microsoft login page flows through:

- `app/browser/tools/webauthnOverride.js` calls `ipcRenderer.invoke("webauthn:get", …)`.
- `app/webauthn/index.js:80` `handleWebauthnRequest`: when `userVerification === "required"`, the PIN is collected up front via `app/webauthn/pinDialog.js`. This PIN dialog is the only UI the flow ever shows.
- `app/webauthn/index.js:114-115` calls `fido2Backend.getAssertion` / `createCredential`.
- `app/webauthn/fido2Backend.js:45` spawns `fido2-assert` / `fido2-cred`. After the PIN is written to stdin (`fido2Backend.js:76`), the child process performs the user-presence check and blocks until the key is physically touched. The `await` does not resolve until `proc.on("close")` (`fido2Backend.js:80`).

During that touch wait the PIN dialog has already closed and no other window is shown. A search confirms there is no touch / user-presence UI anywhere in `app/webauthn/`.

## Why this is a feature request, not a bug

The FIDO2 beta (PR [#2357](https://github.com/IsmaelMartinez/teams-for-linux/pull/2357), [ADR-021](../adr/021-webauthn-fido2-linux.md)) deliberately scoped its UI to PIN entry. A touch prompt was never built. Nothing broke; the flow works for a user who knows to touch the key. The honest framing is a missing-UX polish step in an opt-in beta.

## Feasibility and approach

Feasible and low-risk. The cleanest insertion point is `handleWebauthnRequest` in `app/webauthn/index.js`, wrapping the backend call at lines 114-115: show a non-blocking, frameless `BrowserWindow` (or a `Notification`) immediately before the `await`, and dismiss it in a `finally` once the promise settles, whether on success, error, or the existing 60s timeout (`fido2Backend.js:54`). This reuses the `BrowserWindow` pattern already proven in `pinDialog.js`, so no new infrastructure is needed, and because the backend already resolves or rejects on completion and timeout, dismiss-on-completion is essentially free.

## The one limitation we should not over-promise

`fido2-assert` / `fido2-cred` emit the `Enter PIN for` text to stderr (`fido2Backend.js:72`) but emit nothing at the user-presence step, so the touch wait is silent at the CLI boundary. We can reliably show a prompt that spans the security-key call (or starts right after the PIN is written, or when the process spawns for no-PIN flows), but we cannot fire it at the precise moment the key's LED starts blinking. The realistic deliverable is a generic "waiting for your security key, touch it now" prompt, not a touch-instant signal. Localised libfido2 builds also translate the stderr text (an ADR-021 known limitation), a further reason to avoid stderr-driven precision and prefer wrapping the whole call.

## Risks

- Cancellation: a "Cancel" button would have to replicate the detached-process-group kill already used on timeout (`fido2Backend.js:59`) and reject cleanly, or it risks orphaning the `fido2` child. The simplest first cut is an informational prompt with no cancel, auto-dismissed on completion or timeout.
- Seamlessness: the PIN dialog closes before the touch wait, so the new prompt should appear without a visible gap.
- Scope: Linux-only, behind `auth.webauthn.enabled`, beta.

## Recommendation

Worth doing as a small enhancement. Reframe the ticket from bug to enhancement, set expectations to a call-duration prompt rather than touch-instant, and treat it as the next polish step after the PIN-entry UI the beta already shipped. A focused spike on the `BrowserWindow`-around-the-await approach, with no cancel in v1, is the lowest-risk path.

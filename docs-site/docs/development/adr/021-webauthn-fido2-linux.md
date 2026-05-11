---
id: 021-webauthn-fido2-linux
---

# ADR 021: WebAuthn / FIDO2 Hardware Security Keys on Linux

## Status

✅ Proposed — shipping as an opt-in beta behind the `auth.webauthn.enabled` config flag.

## Context

Hardware security keys (YubiKey, SoloKeys, Nitrokey, Feitian, etc.) have been unusable on `teams-for-linux` for years, tracked in the long-running umbrella issue [#802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802) and a steady stream of duplicates (#1407, #1546, #1338, #1824, #2011, #2038, #1875, #2152, #2332, #2409).

The root cause is upstream: Electron/Chromium on Linux does not ship a native FIDO2 authenticator backend. The WebAuthn JavaScript API surface (`navigator.credentials.create` / `.get`) is present in the renderer and the ceremony starts, but there is no OS-level platform authenticator implementation to complete it against a USB key. The tracking ticket is [electron/electron#24573](https://github.com/electron/electron/issues/24573), which has seen no movement for years. macOS and Windows are unaffected because Chromium on those platforms delegates to the OS WebAuthn stack.

A previous attempt to ship a fix ([PR #2353](https://github.com/IsmaelMartinez/teams-for-linux/pull/2353)) was reverted by [PR #2356](https://github.com/IsmaelMartinez/teams-for-linux/pull/2356) after merge, because it had not been validated against real hardware with a real Microsoft tenant. Community testers (@rafajunio, @machadofelipe, @marcovr, @rlavriv) then iterated on a replacement ([PR #2357](https://github.com/IsmaelMartinez/teams-for-linux/pull/2357)) which has been end-to-end validated on YubiKey + Arch Linux + Microsoft 365 with `fido2-tools` 1.16.0.

## Decision

Ship hardware security key support on Linux via a two-layer `navigator.credentials` monkey-patch that shells out to the `fido2-tools` command-line suite (`fido2-cred`, `fido2-assert`, `fido2-token`) from the main process. Gate the feature behind `auth.webauthn.enabled` (default `false`) so nothing runs for users who do not opt in.

### Architecture

Layer 1 lives in the preload script at `app/browser/tools/webauthnOverride.js` and patches `navigator.credentials.create` and `navigator.credentials.get` in the main frame. Calls with `publicKey` options are serialised and routed to the main process via `ipcRenderer.invoke("webauthn:create"|"webauthn:get")`. Calls without `publicKey`, and `mediation: "conditional"` probes used for passkey autofill, fall through to the original implementation.

Layer 2 lives in the main process at `app/webauthn/index.js` and addresses the subframe case: Microsoft's login flow may trigger the WebAuthn ceremony from a child frame where the preload does not run. For subframes whose origin matches the Microsoft login allowlist, the main process injects a sibling override via `webFrameMain.executeJavaScript()`. The injected script relays requests to the parent frame using `window.parent.postMessage` with an origin-gated listener in the parent preload.

The main-process handler at `app/webauthn/handleWebauthnRequest()` validates the request origin against the allowlist (`login.microsoftonline.com`, `login.microsoft.com`, `login.live.com`), collects the PIN if `userVerification === "required"` (via a `contextIsolation: true` BrowserWindow so the PIN never enters page JS context), and delegates to `app/webauthn/fido2Backend.js` to spawn `fido2-cred` / `fido2-assert`. PIN is written to the child's stdin only after the stderr `Enter PIN for` prompt is detected, avoiding a race with libfido2's readpassphrase fallback logic.

### Rationale

The `fido2-tools` suite is the reference userland implementation from the Yubico / OpenBSD libfido2 project and is packaged in all mainstream Linux distributions (`fido2-tools` on Debian/Ubuntu/Fedora, `libfido2` on Arch). Using it means we do not bundle a native FIDO2 stack of our own, we do not maintain a new native Node.js addon, and we inherit every security fix upstream libfido2 ships.

Monkey-patching `navigator.credentials` rather than intercepting at a lower layer is the only option available. Chromium's WebAuthn code path is a closed internal system; Electron does not expose a hook to register a custom authenticator. The JavaScript surface is the only place a user-land wrapper can interpose.

The opt-in default keeps the blast radius minimal. Users who do not set `auth.webauthn.enabled` see zero change: all gates (platform check, config check, `ipcRenderer` check, `navigator.credentials` check) return early before any patch runs.

Ferdium shipped a conceptually identical approach via `electron-webauthn-linux` (Apache 2.0, Copyright nicholascross), which served as the template for our adaptation. The Ferdium code is not a drop-in fit for our codebase but the shape of the solution translated cleanly.

## Alternatives Considered

### Wait for Chromium Linux WebAuthn

Preferred in principle, but electron/electron#24573 has been idle for years and Chromium shows no sign of prioritising Linux FIDO2. Waiting is indefinite. Rejected.

### Native Node.js FIDO2 library

Evaluated `@vivokey/fido2`, `node-fido2-manager`, and `fido2-lib`. All of these either implement only the server side of FIDO2 (relying-party verification of assertions) or require native HID I/O that we would have to bundle as a compiled addon. `fido2-lib` is server-only. `node-fido2-manager` is a thin libfido2 binding that would make teams-for-linux responsible for distributing prebuilt binaries across four package formats (deb, rpm, AppImage, snap) for at least three architectures (x86_64, arm64, armv7l). Rejected: build/distribution burden is disproportionate to the benefit over shelling out to the distro-shipped `fido2-tools` binaries.

### Chromium virtual authenticator API

The virtual authenticator is a devtools testing facility, not a real platform authenticator. It cannot bridge to a real USB key. Rejected.

### External helper process in Rust or Go

A compiled sidecar would give us a tighter security boundary than spawning `fido2-tools` per ceremony, but would reproduce the same distribution burden as a native Node addon with the added overhead of a separate language toolchain. Rejected for v1; could revisit if `fido2-tools` proves flaky at scale.

## Consequences

### Positive

Users on Linux can finally sign in to Microsoft accounts that require a hardware security key, which is the default posture in many enterprise conditional-access policies. No change for users who do not opt in.

### Negative

Teams for Linux becomes responsible for a CLI-scraping integration that is sensitive to `fido2-tools` output format. Current implementation handles both libfido2 versions that echo input back on stdout (1.16.0+) and versions that do not, but new versions may introduce fresh quirks. See § "Known limitations" below.

Per-ceremony process spawn has latency cost (a few hundred milliseconds) compared to an in-process authenticator. Acceptable for an authentication flow, noticeable but tolerable for ambient passkey autofill (which we disable anyway by passing `mediation === "conditional"` through to the native path).

The v1 implementation uses only the first connected FIDO2 device. Users with multiple keys plugged in simultaneously do not get a device picker.

### Known limitations

- First-device-only: `fido2-token -L` returns all connected devices; we use `devices[0]`. Multi-device selection is a future enhancement.
- Assertion echo-offset heuristic: libfido2 1.16.0+ echoes two lines of input back on stdout before the actual assertion data; older versions do not. We detect by checking whether line 1 matches the `rpId` we passed. This heuristic has been validated against 1.16.0 on Arch; behaviour on older libfido2 builds or future divergent builds is untested.
- PIN-prompt stderr pattern matching: we detect readiness for PIN input by scanning stderr for the literal string `Enter PIN for`. Localised libfido2 builds could emit a translated prompt and break detection.
- No resident-key / passkey enrollment UI: we pass through whatever the caller asks for, but no in-app affordance exists for managing discoverable credentials.

## References

- [#802 umbrella tracking ticket](https://github.com/IsmaelMartinez/teams-for-linux/issues/802)
- [PR #2357 current implementation](https://github.com/IsmaelMartinez/teams-for-linux/pull/2357)
- [PR #2353 initial attempt, reverted](https://github.com/IsmaelMartinez/teams-for-linux/pull/2353)
- [PR #2356 revert](https://github.com/IsmaelMartinez/teams-for-linux/pull/2356)
- [electron/electron#24573 upstream tracking](https://github.com/electron/electron/issues/24573)
- [libfido2 / fido2-tools upstream](https://github.com/Yubico/libfido2)
- [Ferdium electron-webauthn-linux precedent](https://github.com/ferdium/ferdium-app/pull/2337)
- [WebAuthn Level 3 W3C spec](https://www.w3.org/TR/webauthn-3/)
- Local design notes: `docs-site/docs/development/research/webauthn-fido2-implementation-plan.md`
- Related ADR: [ADR 013: PII Log Sanitisation](./013-pii-log-sanitization.md) — governs the `[WEBAUTHN]` structured logging introduced in PR #2357

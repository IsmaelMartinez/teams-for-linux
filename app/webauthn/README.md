# WebAuthn / FIDO2 Hardware Security Key Support

On Linux, Chromium's WebAuthn implementation lacks hardware support. This module intercepts WebAuthn calls (`navigator.credentials`) and routes them through `fido2-tools`.

## Architecture

- `helpers.js`: Shared encoding utilities (base64url, clientDataJSON, input sanitization).
- `fido2Backend.js`: Spawns Yubico `fido2-tools` CLI processes for device discovery, credential creation, and assertion.
- `pinDialog.js`: PIN prompt using standard Electron UI patterns (BrowserWindow + contextBridge + HTML form).
- `touchPrompt.js`: "Waiting for your security key" prompt shown for the duration of the security-key call, with a Cancel that aborts it. Same BrowserWindow + contextBridge pattern as `pinDialog.js`.
- `originAllowlist.js`: Builds the set of origins a ceremony may be served for, from the built-in Microsoft origins plus `auth.webauthn.extraOrigins`. Shared with the preload relay so both gates agree.
- `index.js`: Sets up `ipcMain` handlers, origin validation, and PIN callback wiring.

## Prerequisites

Install `fido2-tools` on your Linux system (the official deb and rpm packages list it as a recommended dependency, so most installs already have it):

```bash
# Debian/Ubuntu
sudo apt install fido2-tools

# Fedora
sudo dnf install fido2-tools

# Arch Linux
sudo pacman -S libfido2
```

## Configuration

Enable in `config.json`:

```json
{
  "auth": {
    "webauthn": {
      "enabled": true
    }
  }
}
```

Ceremonies are only served for the built-in Microsoft login origins. A federated
tenant whose key prompt is served by its own identity provider logs
`[WEBAUTHN] Blocked request { reason: 'origin-not-allowed' }`; add that origin to
`auth.webauthn.extraOrigins` (an array of exact `https` origins, no wildcards or
paths) and restart. The allowlist gates two places, `index.js` and the
postMessage relay in `app/browser/tools/webauthnOverride.js`; both build it from
`originAllowlist.js`, so neither can drift.

## Reading a sign-in log

Every ceremony logs a `[WEBAUTHN]` line at each step, so `grep WEBAUTHN` over a session log shows the whole flow. Four fields matter when a sign-in fails but the ceremony itself reports success:

- `timeoutSec` on `Processing request` is how long the login page is prepared to wait. It is in seconds while every other timing here is in milliseconds, so compare it against `totalMs / 1000`: a ceremony that outlasts it was abandoned by the page, whatever our side reports.
- `pinMs` and `touchMs` on `Succeeded` split the wall-clock between the user typing a PIN and the key waiting to be touched. A large `touchMs` is someone not realising the key wants a touch, not a slow device, since each call is a fresh process paying the same fixed costs. The field is `touchMs` rather than `keyMs` because the log sanitizer redacts any field name containing "key".
- `elapsedMs` on the renderer's `credentials.get() succeeded` is the same window measured from the page's side, so a gap against `totalMs` is IPC or PIN-window overhead.
- `aborted` on that line, plus a `Page aborted credentials.get()` line, say whether the page gave up before we answered. `called without an AbortSignal` means the page never offered a way to cancel, so its own timeout is the only limit.

None of these carry credential material: no credential IDs, user handles, challenges, PINs or raw origins.

## Related

- Browser override: `app/browser/tools/webauthnOverride.js`
- Issue: [#802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802)
- Community validation: [#2332](https://github.com/IsmaelMartinez/teams-for-linux/issues/2332)
- Touch prompt: [#2631](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631), [research note](../../docs-site/docs/development/research/fido2-touch-prompt-research.md)

# WebAuthn / FIDO2 Hardware Security Key Support

On Linux, Chromium's WebAuthn implementation lacks hardware support. This module intercepts WebAuthn calls (`navigator.credentials`) and routes them through `fido2-tools`.

## Architecture

- `helpers.js`: Shared encoding utilities (base64url, clientDataJSON, input sanitization).
- `fido2Backend.js`: Spawns Yubico `fido2-tools` CLI processes for device discovery, credential creation, and assertion.
- `pinDialog.js`: PIN prompt using standard Electron UI patterns (BrowserWindow + contextBridge + HTML form).
- `touchPrompt.js`: "Waiting for your security key" prompt shown for the duration of the security-key call, with a Cancel that aborts it. Same BrowserWindow + contextBridge pattern as `pinDialog.js`. The same window doubles as the "Insert your security key" prompt (`view: "insert"`, text swapped in on `dom-ready`; a query string on the file URL stopped the window from ever showing on Wayland) while `index.js` polls `fido2-token -L` once a second for a key, before the PIN is asked for.
- `originAllowlist.js`: Builds the set of origins a ceremony may be served for, from the built-in Microsoft origins plus `auth.webauthn.extraOrigins`. Shared with the preload relay so both gates agree.
- `index.js`: Sets up `ipcMain` handlers, origin validation, and PIN callback wiring.
- `browserBackend.js`: The experimental `browser` backend (`auth.webauthn.backend: "browser"`). Hands an assertion to a real Chrome, Edge, Chromium, Brave or Vivaldi, which reaches a passkey on a phone over the QR / hybrid flow that Electron on Linux cannot start. See [Browser backend](#browser-backend-phone-passkeys) below.
- `backendStatus.js`: Decides at window creation whether anything will answer a WebAuthn ceremony: the configured backend (Linux, `auth.webauthn.enabled` and either the three `fido2-tools` binaries on `PATH`, or a Chromium-based browser for `auth.webauthn.backend: "browser"`), or a FIDO security key plugged in (a hidraw report descriptor declaring usage page `0xF1D0`, read from `/sys/class/hidraw`), which Electron's native WebAuthn then handles. A key plugged in after the window was created is only noticed after restarting the app (a profile view created later checks again). The snap keeps hiding WebAuthn because its confinement cannot reach USB keys. When neither is present, it passes `--webauthn-no-backend` to the renderer, and the top of `preload.js` hides `PublicKeyCredential` and refuses public-key requests with `NotSupportedError` before any page script runs. Without that, Electron leaves `PublicKeyCredential` defined, Microsoft's sign-in offers a security key, and `navigator.credentials.get()` never settles.

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

## Browser backend (phone passkeys)

Electron on Linux has no WebAuthn transport of its own ([electron/electron#24573](https://github.com/electron/electron/issues/24573)), so the QR / hybrid flow to a phone never starts, and `fido2-tools` only reaches USB keys. A tenant that only accepts phishing-resistant methods, with the passkey on a phone, therefore has no way to sign in. Chromium browsers do run the hybrid flow, so the `browser` backend lends the ceremony to one:

```json
{
  "auth": {
    "webauthn": {
      "enabled": true,
      "backend": "browser"
    }
  }
}
```

For each `credentials.get()`, `browserBackend.js`:

1. Starts the browser (`auth.webauthn.browserPath`, or the first of Chrome, Edge, Chromium, Brave, Vivaldi on `PATH`, see `findBrowser()` in `backendStatus.js`) with a throwaway profile in the temp directory, driven over `--remote-debugging-pipe`: the DevTools protocol runs over the child's fd 3/4, so there is no debugging port for other local processes to reach.
2. Opens a small app window on a static page of the requesting origin, Microsoft's public OpenID metadata (`/common/v2.0/.well-known/openid-configuration`, on `login.live.com` `/.well-known/openid-configuration`). It is JSON, so no page script runs, and the empty profile sends no cookies. It has to be a real HTTPS load: a page served through the DevTools protocol (`Fetch.fulfillRequest`, at request or response stage) is refused with `WebAuthn is not supported on sites with TLS certificate errors`, and a 404 is replaced by Chromium's own error page, whose origin is opaque. The origin and `isSecureContext` are checked before the call.
3. Calls `navigator.credentials.get()` there with the page's own challenge, `rpId`, `allowCredentials`, `userVerification` and timeout. The browser shows its own dialog, including the QR code for a phone.
4. Returns the browser's assertion in the shape `fido2Backend.getAssertion()` returns. The `clientDataJSON` is the browser's own, so it carries the same origin a browser sign-in would.

The request skips the USB key wait, PIN and touch prompts. Closing the browser window cancels; one request runs at a time; the profile is deleted afterwards. Registration (`create`) is refused: passkeys are added in a browser, on the account's Security info page. Origins added with `auth.webauthn.extraOrigins` get their root page, which works only if it loads on that origin without a redirect.

The log shows `[WEBAUTHN:browser] Started browser`, `[WEBAUTHN] Cancelled { reason }` (`window-closed`, `page-closed`, `page-navigated` or `app-quit`), `Assertion received { attachment, hasUserHandle, elapsedMs }` and `[WEBAUTHN] Succeeded { backend: 'browser' }`; no credential material, account or tenant data.

Tests: `tests/unit/webauthnBrowserBackend.test.js`. `WEBAUTHN_BROWSER_IT=1 node --test tests/unit/webauthnBrowserBackend.test.js` also runs the backend against a headless browser and the real page, with a DevTools virtual authenticator, and verifies the signature. A virtual authenticator skips Chromium's TLS check, so that test cannot catch the certificate error above; only a real authenticator can.

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
- Touch prompt: [#2631](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631), [ADR-021](../../docs-site/docs/development/adr/021-webauthn-fido2-linux.md)

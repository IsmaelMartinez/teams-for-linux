# WebAuthn / FIDO2 Hardware Security Key Support

On Linux, Chromium's WebAuthn implementation lacks hardware support. This module intercepts WebAuthn calls (`navigator.credentials`) and routes them through `fido2-tools`.

## Architecture

- `helpers.js`: Shared encoding utilities (base64url, clientDataJSON, input sanitization).
- `fido2Backend.js`: Spawns Yubico `fido2-tools` CLI processes for device discovery, credential creation, and assertion.
- `pinDialog.js`: PIN prompt using standard Electron UI patterns (BrowserWindow + contextBridge + HTML form).
- `index.js`: Sets up `ipcMain` handlers, origin validation, and PIN callback wiring.

## Prerequisites

Install `fido2-tools` on your Linux system:

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

## Related

- Browser override: `app/browser/tools/webauthnOverride.js`
- Issue: [#802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802)
- Community validation: [#2332](https://github.com/IsmaelMartinez/teams-for-linux/issues/2332)

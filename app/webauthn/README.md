# WebAuthn / FIDO2 Hardware Security Key Support

On Linux, Chromium's WebAuthn implementation lacks hardware support. This module intercepts WebAuthn calls (`navigator.credentials`) and routes them through `fido2-tools`.

## Architecture
- `helpers.js`: Shared encoding utilities.
- `fido2Backend.js`: Spawns Yubico `fido2-tools` CLI processes.
- `pinDialog.js`: PIN prompt using standard Electron UI patterns.
- `index.js`: Sets up `ipcMain` handlers.

# Shared Dialog Helpers

Small, reusable window helpers shared across feature modules so dialogs do not each grow their own copy.

`createDialogWindow.js` builds a standard child dialog `BrowserWindow` (used by Add Profile, Join Meeting, etc.).

`securePrompt.js` provides `showSecurePrompt(opts)`, a hardened secret-input window for PIN and password entry. It runs with `contextIsolation`, `sandbox`, and no node integration; the entered secret is returned only through the resolved promise and is never logged or written to disk. Display strings (`heading`, `message`, `warning`, button labels) are passed to the renderer as `loadFile` query parameters so they stay inside the dialog process. The submit/cancel IPC handlers (`secure-prompt:submit` / `secure-prompt:cancel`, in the `app/security/ipcValidator.js` allowlist) are registered once and route each event to the matching prompt by the sender's webContents id, so several prompts can coexist without cross-talk. `securePromptPreload.js` and `securePrompt.html` are its preload and UI. The first consumer is `app/clientCertificate/` (smartcard PIN); the WebAuthn PIN dialog migrates onto this helper opportunistically.

// app/webauthn/pinDialogPreload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  submitPin: (pin) => ipcRenderer.send("webauthn:pin-submit", pin),
  cancelPin: () => ipcRenderer.send("webauthn:pin-cancel"),
});

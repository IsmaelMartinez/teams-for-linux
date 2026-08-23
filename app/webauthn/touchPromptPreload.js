// app/webauthn/touchPromptPreload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  cancelTouch: () => ipcRenderer.send("webauthn:touch-cancel"),
});

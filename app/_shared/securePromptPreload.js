// app/_shared/securePromptPreload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("securePrompt", {
  submit: (value) => ipcRenderer.send("secure-prompt:submit", value),
  cancel: () => ipcRenderer.send("secure-prompt:cancel"),
});

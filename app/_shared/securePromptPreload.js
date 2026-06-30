// app/_shared/securePromptPreload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("securePrompt", {
  // Only forward a non-empty string: an empty value would resolve("") which
  // re-prompts rather than cancelling. Guard at this contextBridge boundary.
  submit: (value) => {
    if (typeof value === "string" && value.length > 0) {
      ipcRenderer.send("secure-prompt:submit", value);
    }
  },
  cancel: () => ipcRenderer.send("secure-prompt:cancel"),
});

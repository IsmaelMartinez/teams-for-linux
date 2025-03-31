const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  selectedSource: (args) => {
    return ipcRenderer.send("selected-source", args);
  },
  closeView: () => {
    return ipcRenderer.send("close-view");
  },
  desktopCapturerGetSources: (args) => {
    return ipcRenderer.invoke("desktop-capturer-get-sources", args);
  },
});

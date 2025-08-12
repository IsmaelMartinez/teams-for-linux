const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  selectedSource: (source) => {
    console.log('Preload: Sending source-selected with:', source ? source.id : 'null');
    return ipcRenderer.send("source-selected", source);
  },
  closeView: () => {
    console.log('Preload: Sending close-view');
    return ipcRenderer.send("close-view");
  },
  desktopCapturerGetSources: async (args) => {
    console.log('Preload: Requesting desktop capturer sources via IPC with args:', args);
    return await ipcRenderer.invoke("desktop-capturer-get-sources", args);
  },
});

console.log('StreamSelector preload script loaded successfully with sandbox enabled');

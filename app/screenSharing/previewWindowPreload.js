const { contextBridge, ipcRenderer } = require("electron");

// #2534: forward the MessagePort that main posts on 'screen-share-port' into
// the main world. Doing this via window.postMessage with transfer is the only
// way to hand a MessagePort across the contextIsolation boundary - the port
// object cannot be serialised through contextBridge function arguments.
ipcRenderer.on("screen-share-port", (event) => {
  if (event.ports?.length) {
    window.postMessage("screen-share-port", "*", event.ports);
  }
});

contextBridge.exposeInMainWorld("electronAPI", {
  // Screen sharing status
  getScreenSharingStatus: () => ipcRenderer.invoke("get-screen-sharing-status"),

  // Window management
  resizeWindow: (dimensions) =>
    ipcRenderer.send("resize-preview-window", dimensions),

  // Screen sharing control
  stopSharing: () => ipcRenderer.send("stop-screen-sharing-from-thumbnail"),

  // Event listeners
  onScreenSharingStatusChanged: (callback) => {
    ipcRenderer.on("screen-sharing-status-changed", callback);
    return () =>
      ipcRenderer.removeListener("screen-sharing-status-changed", callback);
  },
});

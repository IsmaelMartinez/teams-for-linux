const { contextBridge, ipcRenderer } = require("electron");

// #2534: forward the MessagePort that main posts on 'screen-share-port' into
// the main world. Doing this via window.postMessage with transfer is the only
// way to hand a MessagePort across the contextIsolation boundary - the port
// object cannot be serialised through contextBridge function arguments.
// Posting to `window.location.origin` (rather than `"*"`) restricts the
// destination to this document and satisfies SonarCloud's S2819 cross-origin
// check.
ipcRenderer.on("screen-share-port", (event) => {
  if (event.ports?.length) {
    globalThis.postMessage("screen-share-port", globalThis.location.origin, event.ports);
  }
});

contextBridge.exposeInMainWorld("electronAPI", {
  getScreenSharingStatus: () => ipcRenderer.invoke("get-screen-sharing-status"),

  resizeWindow: (dimensions) =>
    ipcRenderer.send("resize-preview-window", dimensions),

  stopSharing: () => ipcRenderer.send("stop-screen-sharing-from-thumbnail"),

  onScreenSharingStatusChanged: (callback) => {
    ipcRenderer.on("screen-sharing-status-changed", callback);
    return () =>
      ipcRenderer.removeListener("screen-sharing-status-changed", callback);
  },
});

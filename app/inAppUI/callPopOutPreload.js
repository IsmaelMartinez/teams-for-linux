const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getScreenSharingStatus: () => ipcRenderer.invoke('get-screen-sharing-status'),
    getScreenShareStream: () => ipcRenderer.invoke('get-screen-share-stream'),
    startScreenShareDisplay: (sourceId) => ipcRenderer.invoke('start-screen-share-display', sourceId),
    resizeWindow: (dimensions) => ipcRenderer.send('resize-call-pop-out-window', dimensions),
});
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Screen sharing status and stream info
    getScreenSharingStatus: () => ipcRenderer.invoke('get-screen-sharing-status'),
    getScreenShareStream: () => ipcRenderer.invoke('get-screen-share-stream'),
    getScreenShareScreen: () => ipcRenderer.invoke('get-screen-share-screen'),
    
    // Window management
    resizeWindow: (dimensions) => ipcRenderer.send('resize-preview-window', dimensions),
    closeWindow: () => ipcRenderer.send('close-preview-window'),
    
    // Screen sharing control
    stopSharing: () => ipcRenderer.send('stop-screen-sharing-from-thumbnail'),
    
    // Event listeners
    onScreenSharingStatusChanged: (callback) => {
        ipcRenderer.on('screen-sharing-status-changed', callback);
        return () => ipcRenderer.removeListener('screen-sharing-status-changed', callback);
    }
});
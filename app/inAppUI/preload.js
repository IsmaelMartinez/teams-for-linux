const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    'electronAPI',
    {
        getAppVersion: () => ipcRenderer.invoke('get-app-version'),
        closeWindow: () => ipcRenderer.send('close-in-app-ui-window'),
        createCallPopOutWindow: () => ipcRenderer.invoke('create-call-pop-out-window'),
    }
);

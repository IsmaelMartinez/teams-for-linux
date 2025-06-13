const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('incomingCallApi', {
    onIncomingCallToastInit: (callback) => {
        ipcRenderer.on('incoming-call-toast-init', (event, data) => {
            if (typeof (callback) === 'function') {
                callback(data);
            }
            ipcRenderer.send('incoming-call-toast-ready');
        });
    },
    sendIncomingCallAction: (action) => {
        ipcRenderer.send('incoming-call-action', action);
    }
});
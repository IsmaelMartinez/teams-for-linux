const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('joinMeetingApi', {
  onInit: (callback) => {
    ipcRenderer.on('init-dialog', (_event, data) => callback(data));
  },
  submit: (url) => {
    ipcRenderer.send('join-meeting-submit', url);
  },
  cancel: () => {
    ipcRenderer.send('join-meeting-cancel');
  },
});

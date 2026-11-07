const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notificationApi', {
  onNotificationToastInit: (callback) => {
    ipcRenderer.on('notification-toast-init', (event, data, style) => {
      if (typeof callback === 'function') {
        callback(data, style);
      }
    });
  },

  notifyClick: () => {
    ipcRenderer.send('notification-toast-click');
  },
});

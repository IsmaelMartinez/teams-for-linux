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

  // Tells the main process the init style is applied, so the toast can be
  // shown without first painting the default look.
  notifyReady: () => {
    ipcRenderer.send('notification-toast-ready');
  },
});

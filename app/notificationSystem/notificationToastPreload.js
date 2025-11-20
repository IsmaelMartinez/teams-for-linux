const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose notification API to renderer process
 * Follows the pattern established by incomingCallToastPreload.js
 */
contextBridge.exposeInMainWorld('notificationApi', {
  /**
   * Register callback for when notification toast is initialized
   * @param {Function} callback - Called with notification data
   */
  onNotificationToastInit: (callback) => {
    ipcRenderer.on('notification-toast-init', (event, data) => {
      if (typeof callback === 'function') {
        callback(data);
      }
    });
  },

  /**
   * Notify main process that user clicked on the notification
   */
  notifyClick: () => {
    ipcRenderer.send('notification-toast-click');
  },
});

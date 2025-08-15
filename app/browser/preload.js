const { contextBridge, ipcRenderer } = require('electron');

// Expose APIs needed by browser scripts with contextIsolation
contextBridge.exposeInMainWorld('electronAPI', {
  desktopCapture: {
    chooseDesktopMedia: (sources, cb) => {
      ipcRenderer
        .invoke('choose-desktop-media', sources)
        .then(streamId => cb(streamId));
      return Date.now();
    },
    cancelChooseDesktopMedia: () =>
      ipcRenderer.send('cancel-desktop-media')
  },
  // Screen sharing events
  sendScreenSharingStarted: (sourceId) => ipcRenderer.send('screen-sharing-started', sourceId),
  sendScreenSharingStopped: () => ipcRenderer.send('screen-sharing-stopped'),
  stopSharing: () => ipcRenderer.send('stop-screen-sharing-from-thumbnail'),
  sendSelectSource: () => ipcRenderer.send('select-source'),
  onSelectSource: (callback) => ipcRenderer.once('select-source', callback),
  send: (channel, ...args) => {
    // Allow sending specific IPC events
    if (['active-screen-share-stream', 'screen-sharing-stopped', 'screen-sharing-started'].includes(channel)) {
      return ipcRenderer.send(channel, ...args);
    }
  },
  
  
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // Notifications
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  playNotificationSound: (options) => ipcRenderer.invoke('play-notification-sound', options),
  
  // Badge count
  setBadgeCount: (count) => ipcRenderer.invoke('set-badge-count', count),
  
  // Tray icon
  updateTray: (icon, flash) => ipcRenderer.send('tray-update', icon, flash),
  
  // Theme events
  onSystemThemeChanged: (callback) => ipcRenderer.on('system-theme-changed', callback),
  
  // User status
  setUserStatus: (data) => ipcRenderer.invoke('user-status-changed', data),
  
  // Zoom
  getZoomLevel: (partition) => ipcRenderer.invoke('get-zoom-level', partition),
  saveZoomLevel: (data) => ipcRenderer.invoke('save-zoom-level', data),
  
  // System information (safe to expose)
  sessionType: process.env.XDG_SESSION_TYPE || 'x11'
});
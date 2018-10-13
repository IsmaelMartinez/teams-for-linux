'use strict';
//require('./renderer.js');
//require('electron-notification-shim');

(function () {
  const path = require('path');
  const { ipcRenderer, webFrame } = require('electron');
  const trayNotifications = require('./tray-notifications');
  const nativeNotifications = require('./native-notifications');
  const zoom = require('./zoom');
  
  const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

  trayNotifications({
    ipc: ipcRenderer,
    iconPath
  });

  document.addEventListener(
    'DOMContentLoaded',
    nativeNotifications({
      ipc: ipcRenderer,
      iconPath
    }));
})();

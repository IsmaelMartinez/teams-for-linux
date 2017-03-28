'use strict';

(function () {
  const path = require('path');
  const { ipcRenderer, BrowserWindow } = require('electron');
  const trayNotifications = require('./tray-notifications');
  const nativeNotifications = require('./native-notifications');

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

'use strict';

(function () {
  const path = require('path');
  const { ipcRenderer, nativeImage, BrowserWindow } = require('electron');
  const trayNotifications = require('./tray-notifications');
  const nativeNotifications = require('./native-notifications');

  const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');
  const icon = nativeImage.createFromPath(iconPath);

  trayNotifications({
    ipc: ipcRenderer,
    icon
  });

  document.addEventListener(
    'DOMContentLoaded',
    nativeNotifications({
      ipc: ipcRenderer,
      icon
    }));
})();

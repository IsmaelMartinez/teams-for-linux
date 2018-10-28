'use strict';

(function () {
  const path = require('path');
  const { ipcRenderer } = require('electron');
  const trayNotifications = require('./tray-notifications');
  require('./zoom')();

  const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

  trayNotifications({
    ipc: ipcRenderer,
    iconPath
  });

  //change userAgent to chrome to fix the issue of notifications disapearing.
  document.addEventListener(
    'DOMContentLoaded',
    navigator.__defineGetter__('userAgent', () => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')
  );
})();

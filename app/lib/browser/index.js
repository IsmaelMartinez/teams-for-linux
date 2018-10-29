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

  // //change userAgent to chrome to fix the issue of notifications disapearing.
  // document.addEventListener(
  //   'DOMContentLoaded',
  //   navigator.__defineGetter__('userAgent', () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/12.246')
  // );
})();

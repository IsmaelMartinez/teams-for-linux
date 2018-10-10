'use strict';

(function () {
  const path = require('path');
  const { ipcRenderer } = require('electron');
  const trayNotifications = require('./tray-notifications');
  const nativeNotifications = require('./native-notifications');

  const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

  // navigator.serviceWorker.register('service-worker.js', {
  //   scope: './'
  // }).then(function(sw) {
  //   log("Registered!", sw);
  //   log("You should get a different response when you refresh the page.");
  // }).catch(function(err) {
  //   log("Error", err);
  // });

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

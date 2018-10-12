'use strict';
//require('./renderer.js');
require('electron-notification-shim');

(function () {
  const path = require('path');
  const { ipcRenderer, webFrame } = require('electron');
  const trayNotifications = require('./tray-notifications');
  const nativeNotifications = require('./native-notifications');
  
  const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

  trayNotifications({
    ipc: ipcRenderer,
    iconPath
  });

  document.addEventListener(
    'keydown', (event) => {
      const keyName = event.key;
    
      if (keyName === 'Control') {
        // do not alert when only Control key is pressed.
        return;
      }
    
      if (event.ctrlKey) {
        if (keyName === '+') {
          webFrame.setZoomLevel(webFrame.getZoomLevel()+1);
        } else if (keyName === '-') {
          webFrame.setZoomLevel(webFrame.getZoomLevel()-1);
        }
      }
    }, false);

  document.addEventListener(
    'DOMContentLoaded',
    nativeNotifications({
      ipc: ipcRenderer,
      iconPath
    }));
})();

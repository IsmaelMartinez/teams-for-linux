'use strict';
const webFrame = require('electron').webFrame;

exports = module.exports = (window) => {
  return {
    label: 'Preferences',
    submenu: [
      {
        label: 'Zoom',
        submenu: [
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' }
        ]
      }
    ]
  };
}

'use strict';
exports = module.exports = () => {
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

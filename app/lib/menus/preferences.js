'use strict';

exports = module.exports = (config, window) => {
  return {
    label: 'Preferences',
    submenu: [
      {
        label: 'User-Agent',
        submenu: [
          {
            label: 'Microsoft Edge',
            click: () => {
              window.webContents.setUserAgent(config.edgeUserAgent);
            }
          },
          {
            label: 'Google Chrome',
            click: () => {
              window.webContents.setUserAgent(config.chromeUserAgent);
            }
          }
        ]
      }
    ]
  };
}

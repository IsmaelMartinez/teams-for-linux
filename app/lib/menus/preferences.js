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
            type: 'radio',
            checked: config.userAgent === 'edge',
            click: () => {
              window.webContents.setUserAgent(config.edgeUserAgent);
            }
          },
          {
            label: 'Google Chrome',
            type: 'radio',
            checked: config.userAgent !== 'edge',
            click: () => {
              window.webContents.setUserAgent(config.chromeUserAgent);
            }
          }
        ]
      }
    ]
  };
}

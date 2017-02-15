
'use strict';

const electron = require('electron');
const path = require('path');
const open = require('open');

const Tray = electron.Tray;
const Menu = electron.Menu;
let shouldQuit = false;

const app = electron.app;
app.on('ready', () => {
  const icon = path.join(app.getAppPath(), 'lib/assets/icons/icon-96x96.png');
  const window = new electron.BrowserWindow({
    width: 800,
    height: 600,
    icon,

    webPreferences: {
      partition: 'persist:teams',
      nodeIntegration: false
    }
  });

  const tray = new Tray(icon);
  tray.setToolTip('Teams');
  tray.on('click', () => {
    if (window.isFocused()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
  });
  tray.setContextMenu(new Menu.buildFromTemplate(
    [
      {
        label: 'Refresh',
        click: () => {
          window.show();
          window.reload();
        }
      },
      {
        label: 'Quit',
        click: () => {
          shouldQuit = true;
          app.quit();
        }
      }
    ]
  ));

  window.on('close',  (event) => {
    if (!shouldQuit) {
      event.preventDefault();
      window.hide();
    } else {
      app.quit();
    }
  });

  window.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    open(url, (err, stdout, stderr) => {
      if (err) {
        console.error(`exec error: ${err}`);
      }
    });
  });

  window.webContents.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36');
  window.loadURL('https://teams.microsoft.com/');
});

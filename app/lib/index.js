
'use strict';

const electron = require('electron');
const path = require('path');
const open = require('open');
const nativeImage = require('electron').nativeImage;

const Tray = electron.Tray;
const Menu = electron.Menu;
let shouldQuit = false;
let tray;

const app = electron.app;
app.on('ready', () => {
  const initialIcon = path.join(app.getAppPath(), 'lib/assets/icons/icon-96x96.png');
  const window = new electron.BrowserWindow({
    width: 800,
    height: 600,
    initialIcon,

    webPreferences: {
      partition: 'persist:teams',
      preload: path.join(__dirname, 'notifications.js'),
      nodeIntegration: false
    }
  });

  tray = new Tray(initialIcon);
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

  window.on('close', (event) => {
    if (!shouldQuit) {
      event.preventDefault();
      window.hide();
    } else {
      app.quit();
    }
  });

  electron.ipcMain.on('notifications', (event, {count, icon}) => {
    try {
      const image = nativeImage.createFromDataURL(icon);
      tray.setImage(image);
      window.flashFrame(count > 0);
    } catch (err) {
      console.error(`Could not update tray icon: ${err.message}`)
    }
  });

  window.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    open(url, (err) => {
      if (err) {
        console.error(`exec error: ${err.message}`);
      }
    });
  });

  window.webContents.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36');
  window.loadURL('https://teams.microsoft.com/');
});

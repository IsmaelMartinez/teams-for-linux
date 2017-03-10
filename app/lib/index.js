
'use strict';

const electron = require('electron');
const path = require('path');
const open = require('open');
const NativeImage = electron.nativeImage;

const Tray = electron.Tray;
const Menu = electron.Menu;
let shouldQuit = false;
let tray;

const app = electron.app;
app.on('ready', () => {
  const icon = path.join(app.getAppPath(), 'lib/assets/icons/icon-96x96.png');
  const window = new electron.BrowserWindow({
    width: 800,
    height: 600,
    icon: icon,
    autoHideMenuBar: true,

    webPreferences: {
      partition: 'persist:teams',
      preload: path.join(__dirname, 'notifications.js'),
      nodeIntegration: false
    }
  });

  // Build menu for window and tray
  let app_menu = new Menu.buildFromTemplate(
    [
      {
        label: 'Refresh',
        accelerator: 'ctrl+R',
        click: () => {
          window.show();
          window.reload();
        }
      },
      {
        label: 'Quit',
        accelerator: 'ctrl+Q',
        click: () => {
          shouldQuit = true;
          app.quit();
        }
      }
    ]
  );
  window.setMenu(new Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: app_menu
    },
    {
      label: 'Help',
      submenu: [
        {
            label: 'Online Documentation',
            click: () => open('https://support.office.com/en-us/teams?omkt=en-001')
        },
        {
          label: 'Github Project',
          click: () => open('https://github.com/ivelkov/teams-for-linux')
        },
        { type: 'separator' },
        {
          label: 'Version ' + app.getVersion(),
          enabled: false
        }
      ]
    }
  ]));

  // Create tray icon
  tray = new Tray(icon);
  tray.setToolTip('Microsoft Teams');
  tray.on('click', () => {
    if (window.isFocused()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
  });
  tray.setContextMenu(app_menu);

  window.on('close', (event) => {
    if (!shouldQuit) {
      event.preventDefault();
      window.hide();
    } else {
      app.quit();
    }
  });

  window.on('page-title-updated', (event, title) => window.webContents.send('page-title', title));
  electron.ipcMain.on('notifications', (event, {count, icon}) => {
    try {
      const image = NativeImage.createFromDataURL(icon);
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

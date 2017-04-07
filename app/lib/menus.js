'use strict';

const {
  app,
  nativeImage,
  ipcMain,
  Tray,
  Menu,
  shell
} = require('electron');

let shouldQuit = false;

class Menus {

  constructor(iconPath) {
    this.iconPath = iconPath;
  }

  static quit() {
    shouldQuit = true;
    app.quit();
  }

  static reload(window) {
    window.show();
    window.reload();
  }

  static open(url) {
    shell.openExternal(url);
  }

  register(window) {
    const appMenu = new Menu.buildFromTemplate(
      [
        {
          label: 'Refresh',
          accelerator: 'ctrl+R',
          click: () => Menus.reload(window)
        },
        {
          label: 'Quit',
          accelerator: 'ctrl+Q',
          click: () => Menus.quit()
        }
      ]
    );

    window.setMenu(new Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: appMenu
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Online Documentation',
            click: () => Menus.open('https://support.office.com/en-us/teams?omkt=en-001')
          },
          {
            label: 'Github Project',
            click: () => Menus.open('https://github.com/ivelkov/teams-for-linux')
          },
          { type: 'separator' },
          {
            label: 'Version ' + app.getVersion(),
            enabled: false
          }
        ]
      }
    ]));

    this.tray = new Tray(this.iconPath);
    this.tray.setToolTip('Microsoft Teams');
    this.tray.on('click', () => {
      if (window.isFocused()) {
        window.hide();
      } else {
        window.show();
        window.focus();
      }
    });
    this.tray.setContextMenu(appMenu);

    window.on('close', (event) => {
      if (!shouldQuit) {
        event.preventDefault();
        window.hide();
      } else {
        app.quit();
      }
    });

    ipcMain.on('notifications', (event, { count, icon }) => {
      try {
        this.image = nativeImage.createFromDataURL(icon);
        this.tray.setImage(this.image);
        window.flashFrame(count > 0);
      } catch (err) {
        console.error(`Could not update tray icon: ${err.message}`, err)
      }
    });
  }
}

exports = module.exports = Menus;

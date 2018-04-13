'use strict';

const {
  app,
  nativeImage,
  ipcMain,
  Tray,
  Menu
} = require('electron');
const preferences = require('./preferences');
const help = require('./help');

let shouldQuit = false;

class Menus {

  constructor(config, iconPath) {
    this.iconPath = iconPath;
    this.config = config;
  }

  static quit() {
    shouldQuit = true;
    app.quit();
  }

  static reload(window) {
    window.show();
    window.reload();
  }

  static open(window) {
    window.show();
  }

  register(window) {
    const appMenu = new Menu.buildFromTemplate(
      [
        {
          label: 'Open',
          accelerator: 'ctrl+O',
          click: () => Menus.open(window)
        },
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
        // workaround for alt+shift showing the hidden menu and blocking input
        label: ''
      },
      {
        label: 'File',
        submenu: appMenu
      },
      preferences(this.config, window),
      help(app)
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
        console.error(`Could not update tray icon: ${err.message}`, err);
      }
    });
  }
}

exports = module.exports = Menus;

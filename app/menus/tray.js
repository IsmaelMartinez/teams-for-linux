const { Tray, Menu, ipcMain, nativeImage } = require("electron");

class ApplicationTray {
  constructor(window, appMenu, iconPath, config) {
    this.window = window;
    this.iconPath = iconPath;
    this.appMenu = appMenu;
    this.config = config;

    this.tray = new Tray(this.iconPath);
    this.tray.setToolTip(this.config.appTitle);
    this.tray.on("click", () => this.showAndFocusWindow());
    this.tray.setContextMenu(Menu.buildFromTemplate(this.appMenu));

    ipcMain.on("tray-update", (_event, { icon, flash }) =>
      this.updateTrayImage(icon, flash),
    );
  }

  setContextMenu(appMenu) {
    this.tray.setContextMenu(Menu.buildFromTemplate(appMenu));
  }

  showAndFocusWindow() {
    this.window.show();
    this.window.focus();
  }

  updateTrayImage(iconUrl, flash) {
    if (this.tray && !this.tray.isDestroyed()) {
      const image = nativeImage.createFromDataURL(iconUrl);

      this.tray.setImage(image);
      this.window.flashFrame(flash);
    }
  }

  close() {
    if (!this.tray.isDestroyed()) {
      this.tray.destroy();
    }
  }
}
exports = module.exports = ApplicationTray;

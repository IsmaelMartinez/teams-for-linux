const { Tray, Menu, ipcMain, nativeImage } = require("electron");
const os = require("node:os");
const isMac = os.platform() === "darwin";

class ApplicationTray {
  constructor(window, appMenu, iconPath, config) {
    this.window = window;
    this.iconPath = iconPath;
    this.appMenu = appMenu;
    this.config = config;

    this.tray = new Tray(
      isMac ? this.getIconImage(this.iconPath) : this.iconPath
    );
    this.tray.setToolTip(this.config.appTitle);
    this.tray.on("click", () => this.showAndFocusWindow());
    this.tray.setContextMenu(Menu.buildFromTemplate(this.appMenu));

    ipcMain.on("tray-update", (_event, data) => {
      // Handle both old format { icon, flash } and new format { icon, flash, count }
      const { icon, flash, count } = data;
      this.updateTrayImage(icon, flash, count);
    });
  }

  getIconImage(iconPath) {
    let image;
    if (iconPath.startsWith("data:")) {
      image = nativeImage.createFromDataURL(iconPath);
    } else {
      image = nativeImage.createFromPath(iconPath);
    }
    if (isMac) {
      image = image.resize({ width: 16, height: 16 });
    }
    return image;
  }

  setContextMenu(appMenu) {
    this.tray.setContextMenu(Menu.buildFromTemplate(appMenu));
  }

  showAndFocusWindow() {
    this.window.show();
    this.window.focus();
  }

  updateTrayImage(iconUrl, flash, count) {
    if (this.tray && !this.tray.isDestroyed()) {
      // Use original icon path if iconUrl is null/undefined
      const effectiveIconPath = iconUrl || this.iconPath;
      const image = this.getIconImage(effectiveIconPath);

      this.tray.setImage(image);
      this.window.flashFrame(flash);
      
      // Update tooltip to show unread count
      const baseTitle = this.config.appTitle;
      const tooltip = count > 0 ? `${baseTitle} (${count})` : baseTitle;
      this.tray.setToolTip(tooltip);
    }
  }

  close() {
    if (!this.tray.isDestroyed()) {
      this.tray.destroy();
    }
  }
}
exports = module.exports = ApplicationTray;

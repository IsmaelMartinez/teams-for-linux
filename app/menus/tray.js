const { Tray, Menu, ipcMain, nativeImage } = require("electron");
const os = require("node:os");
const isMac = os.platform() === "darwin";

class ApplicationTray {
  constructor(window, appMenu, iconPath, config) {
    this.window = window;
    this.iconPath = iconPath;
    this.appMenu = appMenu;
    this.config = config;

    this.tray = new Tray(this.getIconImage(this.iconPath));
    this.tray.setToolTip(this.config.appTitle);
    this.tray.on("click", () => this.showAndFocusWindow());
    this.tray.setContextMenu(Menu.buildFromTemplate(this.appMenu));
  }

  initialize() {
    // Update tray icon based on Teams status (notifications, badge count)
    ipcMain.on("tray-update", this.#handleTrayUpdate.bind(this));
  }

  #handleTrayUpdate(event, data) {
    // With multi-account on, updates arrive from every profile view and
    // applying them directly is last-write-wins — the aggregator decides.
    if (this.aggregator) {
      this.aggregator.onTrayUpdate(event, data);
      return;
    }
    // Stash per sender for the aggregator to replay on attach — renderers
    // dedupe and never re-send an unchanged count. Flag-gated: with
    // multi-account off nothing ever drains it.
    if (this.config.multiAccount?.enabled) {
      this.lastDirectUpdates ??= new Map();
      this.lastDirectUpdates.set(event?.sender?.id, data);
    }
    // Handle both old format { icon, flash } and new format { icon, flash, count }
    const { icon, flash, count } = data;
    this.updateTrayImage(icon, flash, count);
  }

  setAggregator(aggregator) {
    this.aggregator = aggregator;
    if (this.lastDirectUpdates) {
      const replays = this.lastDirectUpdates;
      this.lastDirectUpdates = null;
      for (const [senderId, data] of replays) {
        aggregator.onTrayUpdate({ sender: { id: senderId } }, data);
      }
    }
  }

  applyAggregate({ icon, flash, tooltip }) {
    if (!this.tray || this.tray.isDestroyed()) return;
    // createFromDataURL yields an EMPTY image (not a throw) for a malformed
    // payload, which would blank the tray.
    let image = this.getIconImage(icon || this.iconPath);
    if (image.isEmpty()) {
      image = this.getIconImage(this.iconPath);
    }
    this.tray.setImage(image);
    this.window.flashFrame(flash);
    this.tray.setToolTip(tooltip);
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
    if (this.window.isFocused()) {
      this.window.hide();
    } else {
      if (this.window.isMinimized()) {
        this.window.restore();
      } else if (!this.window.isVisible()) {
        this.window.show();
      }
      this.window.focus();
    }
  }

  updateTrayImage(iconUrl, flash, count) {
    if (this.tray && !this.tray.isDestroyed()) {
      // Use original icon path if iconUrl is null/undefined
      const effectiveIconPath = iconUrl || this.iconPath;
      const image = this.getIconImage(effectiveIconPath);

      this.tray.setImage(image);
      this.window.flashFrame(flash);

      const baseTitle = this.config.appTitle;
      const tooltip = count > 0 ? `${baseTitle} (${count})` : baseTitle;
      this.tray.setToolTip(tooltip);
    }
  }

  setBaseIconPath(iconPath) {
    this.iconPath = iconPath;
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setImage(this.getIconImage(iconPath));
    }
  }

  close() {
    if (!this.tray.isDestroyed()) {
      this.tray.destroy();
    }
  }
}
exports = module.exports = ApplicationTray;

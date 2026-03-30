const { Tray, Menu, ipcMain, nativeImage } = require("electron");
const fs = require("node:fs");
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

  #handleTrayUpdate(_event, data) {
    // Handle both old format { icon, flash } and new format { icon, flash, count }
    const { icon, flash, count } = data;
    this.updateTrayImage(icon, flash, count);
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

      // Update tooltip to show unread count
      const baseTitle = this.config.appTitle;
      const tooltip = count > 0 ? `${baseTitle} (${count})` : baseTitle;
      this.tray.setToolTip(tooltip);
    }
  }

  /**
   * Update the tray icon with a color-coded badge count
   * @param {number} count - Number to display on the badge
   * @param {string} type - 'email' (red) or 'reminder' (orange)
   */
  async updateBadge(count, type = 'email') {
    if (!this.tray || this.tray.isDestroyed()) return;

    if (count > 0 && this.window && this.window.webContents) {
      const badgeColor = type === 'reminder' ? '#FF6600' : '#FF0000';
      const tooltipText = type === 'reminder'
        ? `Microsoft Outlook - ${count} active reminder${count > 1 ? 's' : ''}`
        : `Microsoft Outlook - ${count} unread email${count > 1 ? 's' : ''}`;

      const svgContent = fs.readFileSync(this.iconPath, "utf8");
      const iconDataURL = "data:image/svg+xml;base64," + Buffer.from(svgContent).toString("base64");

      try {
        const dataURL = await this.window.webContents.executeJavaScript(
          `(function(iconSrc, color, count) {
            const canvas = document.createElement('canvas');
            canvas.width = 140;
            canvas.height = 140;
            const ctx = canvas.getContext('2d');

            const image = new Image();
            image.src = iconSrc;

            return new Promise((resolve) => {
              image.onload = () => {
                ctx.drawImage(image, 0, 0, 140, 140);

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(95, 50, 45, 0, 2 * Math.PI);
                ctx.fill();

                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.stroke();

                const displayText = count > 9 ? '9+' : count.toString();
                const fontSize = count > 9 ? 58 : 70;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'white';
                ctx.font = 'bold ' + fontSize + 'px Arial';
                ctx.fillText(displayText, 95, 50);

                resolve(canvas.toDataURL());
              };
            });
          })(${JSON.stringify(iconDataURL)}, ${JSON.stringify(badgeColor)}, ${count})`
        );

        const image = nativeImage.createFromDataURL(dataURL);
        this.tray.setImage(image);
        this.tray.setToolTip(tooltipText);
      } catch (err) {
        console.error('[Tray] Failed to render badge:', err);
      }
    } else {
      this.tray.setImage(this.getIconImage(this.iconPath));
      this.tray.setToolTip('Microsoft Outlook');
    }
  }

  close() {
    if (!this.tray.isDestroyed()) {
      this.tray.destroy();
    }
  }
}
exports = module.exports = ApplicationTray;

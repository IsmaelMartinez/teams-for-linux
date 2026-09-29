const { nativeImage } = require("electron");
const os = require("node:os");
const path = require("node:path");
const iconFolder = path.join(__dirname, "../..", "assets/icons");
const isMac = os.platform() === "darwin";

const icons = {
  icon_default_16: "icon-16x16.png",
  icon_default_96: "icon-96x96.png",
  icon_dark_16: "icon-monochrome-dark-16x16.png",
  icon_dark_96: "icon-monochrome-dark-96x96.png",
  icon_light_16: "icon-monochrome-light-16x16.png",
  icon_light_96: "icon-monochrome-light-96x96.png",
};

class TrayIconChooser {
  constructor(config) {
    this.config = config;
  }
  getFile() {
    if (this.config.appIcon?.trim()) {
      return this.config.appIcon;
    }
    return path.join(
      iconFolder,
      icons[`icon_${this.config.appIconType}_${isMac ? 16 : 96}`],
    );
  }

  // X11 silently drops _NET_WM_ICON once the image no longer fits in one
  // request (about 240px square on Xwayland), so the window icon is capped.
  static windowImage(iconPath) {
    const image = nativeImage.createFromPath(iconPath);
    const { width, height } = image.getSize();
    if (Math.max(width, height) <= 128) return image;
    return width >= height
      ? image.resize({ width: 128 })
      : image.resize({ height: 128 });
  }
}

module.exports = TrayIconChooser;

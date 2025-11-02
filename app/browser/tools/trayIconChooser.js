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
    if (this.config.appIcon.trim() !== "") {
      return this.config.appIcon;
    }
    return path.join(
      iconFolder,
      icons[`icon_${this.config.appIconType}_${isMac ? 16 : 96}`],
    );
  }
}

module.exports = TrayIconChooser;

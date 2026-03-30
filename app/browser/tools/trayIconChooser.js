const path = require("node:path");
const iconFolder = path.join(__dirname, "../..", "assets/icons");

class TrayIconChooser {
  constructor(config) {
    this.config = config;
  }
  getFile() {
    if (this.config.appIcon.trim() !== "") {
      return this.config.appIcon;
    }
    return path.join(iconFolder, "icon.svg");
  }
}

module.exports = TrayIconChooser;

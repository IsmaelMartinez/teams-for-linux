const path = require("node:path");
const os = require("node:os");
const iconFolder = path.join(__dirname, "../..", "assets/icons");

class TrayIconChooser {
  constructor(config) {
    this.config = config;
  }
  getFile() {
    if (this.config.appIcon.trim() !== "") {
      return this.config.appIcon;
    }
    return path.join(iconFolder, "icon-16x16.png");
  }
}

module.exports = TrayIconChooser;

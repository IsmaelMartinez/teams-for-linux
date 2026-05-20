const { ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const LOG_PREFIX = "[CUSTOM_STICKERS]";

const EXTENSION_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

class CustomStickers {
  constructor(app, config) {
    this.app = app;
    this.config = config;
    this.stickerFolder = null;

    if (!this.isEnabled()) {
      return;
    }

    // Return the list of stickers (image files) from the configured folder.
    // Each entry includes a base64 data URL so the renderer can show thumbnails
    // and rebuild a File for synthetic-paste insertion without needing direct
    // filesystem access.
    ipcMain.handle("get-sticker-list", () => this.handleGetStickerList());
  }

  initialize() {
    if (!this.isEnabled()) {
      return;
    }

    this.stickerFolder = this.resolveStickerFolder();
    try {
      const created = !fs.existsSync(this.stickerFolder);
      fs.mkdirSync(this.stickerFolder, { recursive: true });
      console.info(`${LOG_PREFIX} Sticker folder ready`);
      if (created) {
        this.seedExampleSticker();
      }
    } catch (err) {
      console.error(
        `${LOG_PREFIX} Failed to create sticker folder: ${err.message}`,
      );
    }
  }

  seedExampleSticker() {
    // Drop a single bundled example into the user's freshly-created folder so
    // the panel has something to show on first open. User can delete it and
    // add their own. Only runs when the folder did not exist before init.
    const exampleSrc = path.join(__dirname, "example", "example-teams-for-linux.png");
    const exampleDest = path.join(this.stickerFolder, "example-teams-for-linux.png");
    try {
      if (!fs.existsSync(exampleSrc)) {
        return;
      }
      fs.copyFileSync(exampleSrc, exampleDest);
      console.info(`${LOG_PREFIX} Seeded example sticker`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to seed example sticker: ${err.message}`);
    }
  }

  isEnabled() {
    return this.config.customStickers?.enabled === true;
  }

  resolveStickerFolder() {
    const configured = this.config.customStickers?.folder;
    if (configured && configured.trim() !== "") {
      return configured;
    }
    return path.join(this.app.getPath("userData"), "stickers");
  }

  getAllowedFormats() {
    const formats = this.config.customStickers?.formats;
    if (!Array.isArray(formats) || formats.length === 0) {
      return ["png", "jpg", "jpeg", "gif"];
    }
    return formats.map((f) => String(f).toLowerCase().replace(/^\./, ""));
  }

  handleGetStickerList() {
    const folder = this.stickerFolder ?? this.resolveStickerFolder();
    if (!fs.existsSync(folder)) {
      console.warn(`${LOG_PREFIX} Sticker folder does not exist`);
      return { folder, stickers: [] };
    }

    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to read sticker folder: ${err.message}`);
      return { folder, stickers: [] };
    }

    const allowed = new Set(this.getAllowedFormats());
    const stickers = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (!allowed.has(ext)) {
        continue;
      }
      const mimeType = EXTENSION_MIME[ext];
      if (!mimeType) {
        continue;
      }
      const filePath = path.join(folder, entry.name);
      try {
        const buf = fs.readFileSync(filePath);
        stickers.push({
          name: entry.name,
          mimeType,
          dataUrl: `data:${mimeType};base64,${buf.toString("base64")}`,
        });
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} Skipped sticker (read failure): ${err.message}`,
        );
      }
    }

    stickers.sort((a, b) => a.name.localeCompare(b.name));
    return { folder, stickers };
  }
}

module.exports = CustomStickers;

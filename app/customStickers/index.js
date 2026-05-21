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
      return ["png", "jpg", "jpeg", "gif", "webp"];
    }
    return formats.map((f) => String(f).toLowerCase().replace(/^\./, ""));
  }

  #readStickerFile(filePath, name, subfolder, allowed) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!allowed.has(ext)) {
      return null;
    }
    const mimeType = EXTENSION_MIME[ext];
    if (!mimeType) {
      return null;
    }
    try {
      const buf = fs.readFileSync(filePath);
      return {
        name,
        subfolder,
        mimeType,
        dataUrl: `data:${mimeType};base64,${buf.toString("base64")}`,
      };
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} Skipped sticker (read failure): ${err.message}`,
      );
      return null;
    }
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
      if (entry.isFile()) {
        const sticker = this.#readStickerFile(
          path.join(folder, entry.name),
          entry.name,
          "",
          allowed,
        );
        if (sticker) stickers.push(sticker);
        continue;
      }
      if (!entry.isDirectory()) {
        continue;
      }
      // Recurse exactly one level so packs imported under <folder>/<pack>/
      // (Telegram, AI, URL-paste subfolders) are visible. Deeper trees are
      // intentionally not scanned to keep the model simple.
      const subPath = path.join(folder, entry.name);
      let subEntries;
      try {
        subEntries = fs.readdirSync(subPath, { withFileTypes: true });
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} Skipped subfolder (read failure): ${err.message}`,
        );
        continue;
      }
      for (const subEntry of subEntries) {
        if (!subEntry.isFile()) continue;
        const sticker = this.#readStickerFile(
          path.join(subPath, subEntry.name),
          subEntry.name,
          entry.name,
          allowed,
        );
        if (sticker) stickers.push(sticker);
      }
    }

    stickers.sort((a, b) => {
      if (a.subfolder !== b.subfolder) {
        return a.subfolder.localeCompare(b.subfolder);
      }
      return a.name.localeCompare(b.name);
    });
    return { folder, stickers };
  }
}

module.exports = CustomStickers;

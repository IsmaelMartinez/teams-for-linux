const { ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const LOG_PREFIX = "[CUSTOM_STICKERS]";

const EXTENSION_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

const CONTENT_TYPE_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

const DEFAULT_URL_IMPORT_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];
const DEFAULT_URL_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

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

    // Download an HTTPS URL into the sticker folder. Validates the URL is
    // HTTPS, the response content-type is on the allowlist, and the byte
    // length is under the configured cap. Returns { success, filename }
    // or { success: false, error }.
    ipcMain.handle("import-sticker-url", (_event, rawUrl) =>
      this.handleImportStickerUrl(rawUrl),
    );
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

  isUrlImportEnabled() {
    return this.config.customStickers?.urlImport?.enabled !== false;
  }

  getUrlImportContentTypes() {
    const configured = this.config.customStickers?.urlImport?.allowedContentTypes;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured.map((t) => String(t).toLowerCase());
    }
    return DEFAULT_URL_IMPORT_CONTENT_TYPES;
  }

  getUrlImportMaxBytes() {
    const configured = this.config.customStickers?.urlImport?.maxBytes;
    if (typeof configured === "number" && configured > 0) {
      return configured;
    }
    return DEFAULT_URL_IMPORT_MAX_BYTES;
  }

  static deriveSlug(urlString) {
    let last = "";
    try {
      const u = new URL(urlString);
      const segments = u.pathname.split("/").filter(Boolean);
      last = segments[segments.length - 1] || u.hostname;
    } catch {
      last = "sticker";
    }
    // Strip extension, lowercase, replace non-alphanumeric with dashes,
    // collapse repeats, trim, cap length.
    const noExt = last.replace(/\.[^.]+$/, "");
    const sanitised = noExt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return sanitised || "sticker";
  }

  async handleImportStickerUrl(rawUrl) {
    if (!this.isEnabled()) {
      return { success: false, error: "Custom stickers is disabled" };
    }
    if (!this.isUrlImportEnabled()) {
      return { success: false, error: "URL import is disabled" };
    }

    let url;
    try {
      url = new URL(String(rawUrl));
    } catch {
      return { success: false, error: "Invalid URL" };
    }
    if (url.protocol !== "https:") {
      return { success: false, error: "Only HTTPS URLs are accepted" };
    }

    const allowedTypes = this.getUrlImportContentTypes();
    const maxBytes = this.getUrlImportMaxBytes();

    let response;
    try {
      response = await fetch(url.toString(), { redirect: "follow" });
    } catch (err) {
      console.warn(`${LOG_PREFIX} URL fetch failed: ${err.message}`);
      return { success: false, error: `Fetch failed: ${err.message}` };
    }

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const rawContentType = response.headers.get("content-type") || "";
    const contentType = rawContentType.split(";")[0].trim().toLowerCase();
    if (!allowedTypes.includes(contentType)) {
      return {
        success: false,
        error: `Unsupported content-type: ${contentType || "unknown"}`,
      };
    }

    const declaredLength = parseInt(
      response.headers.get("content-length") || "0",
      10,
    );
    if (declaredLength > maxBytes) {
      return {
        success: false,
        error: `File too large (${declaredLength} bytes)`,
      };
    }

    let buf;
    try {
      buf = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      return { success: false, error: `Read failed: ${err.message}` };
    }
    if (buf.length > maxBytes) {
      return { success: false, error: `File too large (${buf.length} bytes)` };
    }

    const ext = CONTENT_TYPE_EXT[contentType] || "png";
    const slug = CustomStickers.deriveSlug(url.toString());
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
    const filename = `${slug}-${hash}.${ext}`;
    const folder = this.stickerFolder ?? this.resolveStickerFolder();

    try {
      fs.mkdirSync(folder, { recursive: true });
      const destPath = path.join(folder, filename);
      fs.writeFileSync(destPath, buf);
      console.info(`${LOG_PREFIX} Imported URL sticker: ${filename}`);
      return { success: true, filename };
    } catch (err) {
      return { success: false, error: `Write failed: ${err.message}` };
    }
  }
}

module.exports = CustomStickers;

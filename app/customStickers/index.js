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
const URL_IMPORT_FETCH_TIMEOUT_MS = 30000;

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
    // length is under the configured cap. Returns `{ success, filename }`
    // on success or `{ success: false, error }` on failure.
    ipcMain.handle("import-sticker-url", (_event, rawUrl) =>
      this.handleImportStickerUrl(rawUrl),
    );

    // Delete a sticker file from the sticker folder. Validates the requested
    // name/subfolder do not contain path-traversal components and resolves
    // strictly inside the sticker folder before unlinking. Returns
    // `{ success }` on success or `{ success: false, error }` on failure.
    ipcMain.handle("delete-sticker", (_event, payload) =>
      this.handleDeleteSticker(payload),
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

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      URL_IMPORT_FETCH_TIMEOUT_MS,
    );
    let response;
    try {
      response = await fetch(url.toString(), {
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err.name === "AbortError" ? "Fetch timed out" : err.message;
      console.warn(`${LOG_PREFIX} URL fetch failed: ${msg}`);
      return { success: false, error: `Fetch failed: ${msg}` };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      await CustomStickers.#cancelBody(response);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const rawContentType = response.headers.get("content-type") || "";
    const contentType = rawContentType.split(";")[0].trim().toLowerCase();
    if (!allowedTypes.includes(contentType)) {
      await CustomStickers.#cancelBody(response);
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
      await CustomStickers.#cancelBody(response);
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
      console.info(`${LOG_PREFIX} URL sticker imported`);
      return { success: true, filename };
    } catch (err) {
      return { success: false, error: `Write failed: ${err.message}` };
    }
  }

  static async #cancelBody(response) {
    // Drain or cancel the response body when returning early so the
    // underlying socket is released back to the pool.
    try {
      await response.body?.cancel();
    } catch {
      // Cancellation failures are not actionable; ignore.
    }
  }

  handleDeleteSticker(payload) {
    if (!this.isEnabled()) {
      return { success: false, error: "Custom stickers is disabled" };
    }
    const name = payload?.name;
    const subfolder = payload?.subfolder ?? "";

    if (typeof name !== "string" || name.length === 0) {
      return { success: false, error: "Invalid sticker name" };
    }
    if (
      name.includes("/") ||
      name.includes("\\") ||
      name.includes("\0") ||
      name === "." ||
      name === ".."
    ) {
      return { success: false, error: "Invalid sticker name" };
    }
    if (typeof subfolder !== "string") {
      return { success: false, error: "Invalid subfolder" };
    }
    if (
      subfolder.includes("/") ||
      subfolder.includes("\\") ||
      subfolder.includes("\0") ||
      subfolder === "." ||
      subfolder === ".."
    ) {
      return { success: false, error: "Invalid subfolder" };
    }

    const folder = this.stickerFolder ?? this.resolveStickerFolder();
    const candidatePath = subfolder
      ? path.join(folder, subfolder, name)
      : path.join(folder, name);

    // Defence in depth: resolve both sides through realpath (which follows
    // symlinks) and confirm the resulting file remains strictly inside the
    // sticker folder. path.resolve alone only normalises strings, so a
    // renderer that managed to plant a symlinked subfolder pointing outside
    // the sticker folder could otherwise escape. realpathSync throws
    // ENOENT for missing files, which we translate to a normal "not found"
    // response.
    let resolvedFolder;
    let resolvedFile;
    try {
      resolvedFolder = fs.realpathSync(folder);
      resolvedFile = fs.realpathSync(candidatePath);
    } catch (err) {
      if (err.code === "ENOENT") {
        return { success: false, error: "Sticker not found" };
      }
      return { success: false, error: `Resolve failed: ${err.message}` };
    }
    const insideFolder =
      resolvedFile.startsWith(resolvedFolder + path.sep) &&
      resolvedFile !== resolvedFolder;
    if (!insideFolder) {
      return { success: false, error: "Path resolution outside sticker folder" };
    }

    try {
      fs.unlinkSync(resolvedFile);
      console.info(`${LOG_PREFIX} Sticker deleted`);
      return { success: true };
    } catch (err) {
      if (err.code === "ENOENT") {
        return { success: false, error: "Sticker not found" };
      }
      return { success: false, error: `Delete failed: ${err.message}` };
    }
  }
}

module.exports = CustomStickers;

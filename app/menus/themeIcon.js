const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The desktop resolves taskbar, launcher and app menu icons by name from the
// icon theme, never from the running window, so a custom icon only shows
// there once a copy sits in the per-user hicolor theme under that name.
const SIZES = [16, 22, 24, 32, 48, 64, 96, 128, 256, 512];
const DEFAULT_NAME = "teams-for-linux";
const NAME_PATTERN = /^[\w.-]+$/;

let bus = null;

function dataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
}

function hicolorDir() {
  return path.join(dataHome(), "icons", "hicolor");
}

function manifestFile() {
  return path.join(dataHome(), DEFAULT_NAME, "theme-icon.json");
}

function supported() {
  return process.platform === "linux" && !process.env.SNAP && !process.env.FLATPAK_ID;
}

function readDesktopFiles() {
  const dirs = [dataHome(), ...(process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":")];
  const files = [];
  for (const dir of dirs) {
    const appsDir = path.join(dir, "applications");
    let entries;
    try {
      entries = fs.readdirSync(appsDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".desktop")) continue;
      try {
        files.push({ name: entry, text: fs.readFileSync(path.join(appsDir, entry), "utf8") });
      } catch {
        // unreadable entries are skipped
      }
    }
  }
  return files;
}

// Pick the desktop file the shell matches this window to: a profile launcher
// by its StartupWMClass (see multiple-instances.md), otherwise the packaged
// entry by file name, otherwise whichever launches this binary (AppImage
// integrations install one under their own icon name).
function iconName({ windowClass } = {}) {
  const files = readDesktopFiles();
  const exe = process.env.APPIMAGE || process.execPath;
  const match =
    (windowClass && files.find((f) => f.text.split('\n').some((l) => l.trim() === `StartupWMClass=${windowClass}`))) ||
    files.find((f) => f.name === `${DEFAULT_NAME}.desktop`) ||
    files.find((f) => f.text.includes(exe));
  const icon = match && /^Icon=(.+)$/m.exec(match.text)?.[1].trim();
  return icon && NAME_PATTERN.test(icon) ? icon : DEFAULT_NAME;
}

function iconFile(size, name) {
  return path.join(hicolorDir(), `${size}x${size}`, "apps", `${name}.png`);
}

// One manifest per user, keyed by icon name, so profiles with their own
// launcher (and icon name) never touch each other's files.
function readManifest() {
  try {
    const data = JSON.parse(fs.readFileSync(manifestFile(), "utf8"));
    return Array.isArray(data) ? {} : data;
  } catch {
    return {};
  }
}

function writeManifest(manifest) {
  if (Object.keys(manifest).length === 0) {
    fs.rmSync(manifestFile(), { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(manifestFile()), { recursive: true });
  fs.writeFileSync(manifestFile(), JSON.stringify(manifest));
}

function refresh() {
  // GTK desktops watch the theme directory's mtime; KDE listens for this signal.
  const now = new Date();
  try {
    fs.utimesSync(hicolorDir(), now, now);
  } catch (error) {
    console.warn("[ThemeIcon] could not touch the icon theme directory", { message: error.message });
  }
  try {
    if (!bus) {
      // A failed connect arrives as an async error event, which this catch
      // never sees; without the listener it would take the app down.
      bus = require("@homebridge/dbus-native").sessionBus();
      bus.connection.on("error", (error) => {
        console.warn("[ThemeIcon] session bus connection failed", { message: error.message });
        bus = null;
      });
    }
    bus.sendSignal("/KIconLoader", "org.kde.KIconLoader", "iconChanged", "i", [0]);
  } catch (error) {
    console.warn("[ThemeIcon] could not send the icon change signal", { message: error.message });
  }
}

function installed(opts) {
  return supported() && Boolean(readManifest()[iconName(opts)]);
}

// Every size goes to a temp name first and is renamed over the real file only
// once all of them are written, so a failed replacement leaves the previous
// icon set whole. A size that already holds a file this app did not write is
// skipped, so hand-placed icons are never overwritten or later removed.
function install(image, opts) {
  if (!supported()) return false;
  const name = iconName(opts);
  const owned = new Set(readManifest()[name]);
  const { width, height } = image.getSize();
  const pending = [];
  try {
    for (const size of SIZES) {
      const file = iconFile(size, name);
      if (!owned.has(file) && fs.existsSync(file)) continue;
      const temp = `${file}.tmp-${process.pid}`;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const resized = image.resize(width >= height ? { width: size } : { height: size });
      fs.writeFileSync(temp, resized.toPNG());
      pending.push({ temp, file });
    }
    if (pending.length === 0) {
      console.warn("[ThemeIcon] every size already holds an icon this app did not write, leaving them alone");
      return false;
    }
    for (const { temp, file } of pending) fs.renameSync(temp, file);
    writeManifest({ ...readManifest(), [name]: pending.map((p) => p.file) });
  } catch (error) {
    console.warn("[ThemeIcon] could not write the icon theme, leaving it untouched", { message: error.message });
    for (const { temp } of pending) fs.rmSync(temp, { force: true });
    return false;
  }
  refresh();
  return true;
}

// Only files this app wrote under this name are removed; hand-placed icons
// and other profiles' icons are left alone.
function remove(opts) {
  if (!supported()) return false;
  const manifest = readManifest();
  const name = iconName(opts);
  const files = manifest[name];
  if (!files) return false;
  try {
    for (const file of files) fs.rmSync(file, { force: true });
    delete manifest[name];
    writeManifest(manifest);
  } catch (error) {
    console.warn("[ThemeIcon] could not remove the icon theme files", { message: error.message });
    return false;
  }
  refresh();
  return true;
}

module.exports = { install, installed, remove, iconName, supported };

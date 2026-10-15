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
function iconName() {
  const files = readDesktopFiles();
  const wmClass = process.argv.find((arg) => arg.startsWith("--class="))?.slice(8);
  const exe = process.env.APPIMAGE || process.execPath;
  const match =
    (wmClass && files.find((f) => f.text.includes(`StartupWMClass=${wmClass}`))) ||
    files.find((f) => f.name === `${DEFAULT_NAME}.desktop`) ||
    files.find((f) => f.text.includes(exe));
  const icon = match && /^Icon=(.+)$/m.exec(match.text)?.[1].trim();
  return icon && NAME_PATTERN.test(icon) ? icon : DEFAULT_NAME;
}

function iconFile(size, name) {
  return path.join(hicolorDir(), `${size}x${size}`, "apps", `${name}.png`);
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestFile(), "utf8"));
  } catch {
    return [];
  }
}

function writeManifest(files) {
  fs.mkdirSync(path.dirname(manifestFile()), { recursive: true });
  fs.writeFileSync(manifestFile(), JSON.stringify(files));
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
    bus ??= require("@homebridge/dbus-native").sessionBus();
    bus.sendSignal("/KIconLoader", "org.kde.KIconLoader", "iconChanged", "i", [0]);
  } catch (error) {
    console.warn("[ThemeIcon] could not send the icon change signal", { message: error.message });
  }
}

function install(image) {
  if (!supported()) return false;
  const name = iconName();
  const { width, height } = image.getSize();
  const written = [];
  try {
    for (const size of SIZES) {
      const file = iconFile(size, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const resized = image.resize(width >= height ? { width: size } : { height: size });
      fs.writeFileSync(file, resized.toPNG());
      written.push(file);
    }
    writeManifest(written);
  } catch (error) {
    console.warn("[ThemeIcon] could not write the icon theme, leaving it untouched", { message: error.message });
    for (const file of written) fs.rmSync(file, { force: true });
    return false;
  }
  refresh();
  return true;
}

// Only files this app wrote are removed; hand-placed icons are left alone.
function remove() {
  if (!supported()) return false;
  const files = readManifest();
  if (files.length === 0) return false;
  try {
    for (const file of files) fs.rmSync(file, { force: true });
    fs.rmSync(manifestFile(), { force: true });
  } catch (error) {
    console.warn("[ThemeIcon] could not remove the icon theme files", { message: error.message });
    return false;
  }
  refresh();
  return true;
}

module.exports = { install, remove, iconName, supported };

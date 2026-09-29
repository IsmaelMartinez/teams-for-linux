const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The desktop resolves taskbar, launcher and app menu icons by name from the
// icon theme, never from the running window, so a custom icon only shows
// there once a copy sits in the per-user hicolor theme under that name.
const SIZES = [16, 22, 24, 32, 48, 64, 96, 128, 256, 512];
const DEFAULT_NAME = "teams-for-linux";

let bus = null;

function dataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
}

function hicolorDir() {
  return path.join(dataHome(), "icons", "hicolor");
}

function supported() {
  return process.platform === "linux" && !process.env.SNAP && !process.env.FLATPAK_ID;
}

// AppImage integrations install the desktop file under their own icon
// name, so take the name from whichever desktop file launches this binary.
function iconName() {
  const exe = process.env.APPIMAGE || process.execPath;
  const dirs = [dataHome(), ...(process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":")];
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
      let text;
      try {
        text = fs.readFileSync(path.join(appsDir, entry), "utf8");
      } catch {
        continue;
      }
      if (!text.includes(exe)) continue;
      const icon = /^Icon=(.+)$/m.exec(text)?.[1].trim();
      if (icon && !path.isAbsolute(icon)) return icon;
    }
  }
  return DEFAULT_NAME;
}

function iconFile(size, name) {
  return path.join(hicolorDir(), `${size}x${size}`, "apps", `${name}.png`);
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
  for (const size of SIZES) {
    const file = iconFile(size, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const resized = image.resize(width >= height ? { width: size } : { height: size });
    fs.writeFileSync(file, resized.toPNG());
  }
  refresh();
  return true;
}

function remove() {
  if (!supported()) return false;
  const name = iconName();
  for (const size of SIZES) {
    fs.rmSync(iconFile(size, name), { force: true });
  }
  refresh();
  return true;
}

module.exports = { install, remove, iconName, supported };

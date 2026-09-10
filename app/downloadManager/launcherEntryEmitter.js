/**
 * Unity LauncherEntry emitter (aggregate progress on the dock / taskbar entry).
 *
 * Emits `com.canonical.Unity.LauncherEntry.Update` D-Bus broadcast signals so
 * that Linux launchers subscribed to that interface render progress on the
 * application's icon. The Unity launcher itself was discontinued in 2017,
 * but the protocol it defined is what Ubuntu Dock (default GNOME extension
 * shipped on Ubuntu since 17.10) and the popular Dash-to-Dock GNOME extension
 * use today — so emitting these signals covers the single largest Linux DE
 * audience (GNOME / Ubuntu).
 *
 * Why we emit the signal directly instead of relying on `BrowserWindow
 * .setProgressBar()`: Electron gates that call on the `com.canonical.Unity`
 * D-Bus name owner, which no modern DE registers, so `setProgressBar` is a
 * silent no-op on every modern Linux setup. Emitting the broadcast signal
 * ourselves bypasses Electron's dead probe — receivers (Ubuntu Dock,
 * Dash-to-Dock, etc.) match the signal by interface and the desktop URI in
 * its arguments, regardless of who owns any well-known name.
 *
 * The protocol:
 *   - Interface: `com.canonical.Unity.LauncherEntry`
 *   - Signal:    `Update`
 *   - Path:      `/com/canonical/unity/launcherentry/<numeric-id>`
 *                (path is informational; receivers match on args)
 *   - Args:      `(s: desktop_entry_uri, a{sv}: properties)`
 *   - Properties of interest:
 *       progress         (double 0..1)
 *       progress-visible (boolean)
 *       count            (int64)
 *       count-visible    (boolean)
 *       urgent           (boolean)
 *
 * Unlike `jobViewEmitter`, this is *aggregate* — one running app icon, one
 * progress value. `DownloadManager` calls `update({ progress, progressVisible })`
 * with the byte-weighted average of all active downloads, and
 * `update({ progressVisible: false })` once the queue drains.
 */

const dbus = require("@homebridge/dbus-native");

const INTERFACE = "com.canonical.Unity.LauncherEntry";
const MEMBER = "Update";

/**
 * Desktop URI the receivers match the signal against. It must name the
 * desktop file as the *host* sees it, which depends on the packaging:
 * snapd exports desktop files as `<instance>_<file>.desktop` and Flatpak
 * as `<app-id>.desktop`, so the plain app name only matches for deb/rpm/
 * AppImage installs. A mismatched URI is silently dropped by the dock —
 * the badge/progress just never shows (#2620 follow-up).
 *
 * @param {string} appName
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function computeDesktopUri(appName, env) {
  if (env.SNAP_INSTANCE_NAME) {
    return `application://${env.SNAP_INSTANCE_NAME}_${appName}.desktop`;
  }
  if (env.FLATPAK_ID) {
    return `application://${env.FLATPAK_ID}.desktop`;
  }
  return `application://${appName}.desktop`;
}

let desktopUri = null;
let signalPath = null;

function getEntry() {
  if (!desktopUri) {
    // Lazy: `app.name` may still change while startup switches are applied
    // (config `class` calls app.setName()), and this module is only used
    // after the app is ready.
    const { app } = require("electron");
    desktopUri = computeDesktopUri(app.name, process.env);
    signalPath = `/com/canonical/unity/launcherentry/${simpleHash(desktopUri)}`;
  }
  return { desktopUri, signalPath };
}

let bus = null;
let busDisabled = false;

function getBus() {
  if (busDisabled) return null;
  if (!bus) {
    try {
      bus = dbus.sessionBus();
    } catch (error) {
      console.warn("[DownloadManager] dbus sessionBus unavailable", {
        message: error.message,
      });
      busDisabled = true;
      return null;
    }
  }
  return bus;
}

/**
 * Emit a LauncherEntry Update broadcast signal.
 *
 * @param {object} props - Subset of {progress, progressVisible, count, countVisible, urgent}
 */
function update(props = {}) {
  const sessionBus = getBus();
  if (!sessionBus) return;

  const properties = [];
  if (typeof props.progress === "number") {
    properties.push(["progress", ["d", props.progress]]);
  }
  if (typeof props.progressVisible === "boolean") {
    properties.push(["progress-visible", ["b", props.progressVisible]]);
  }
  if (typeof props.count === "number") {
    properties.push(["count", ["x", Math.trunc(props.count)]]);
  }
  if (typeof props.countVisible === "boolean") {
    properties.push(["count-visible", ["b", props.countVisible]]);
  }
  if (typeof props.urgent === "boolean") {
    properties.push(["urgent", ["b", props.urgent]]);
  }

  try {
    // dbus-native's bus.sendSignal() builds the message with the right
    // serial counter and pushes it through `connection.message()` which
    // buffers pre-handshake and writes post-handshake. (A previous attempt
    // that set the serial manually crashed with "Missing or invalid serial"
    // when the message was marshalled during the handshake window.)
    const entry = getEntry();
    sessionBus.sendSignal(entry.signalPath, INTERFACE, MEMBER, "sa{sv}", [
      entry.desktopUri,
      properties,
    ]);
  } catch (error) {
    console.warn("[DownloadManager] Failed to emit LauncherEntry signal", {
      message: error.message,
    });
  }
}

/**
 * Lightweight string-to-uint hash. Not cryptographic; used only to derive a
 * stable numeric id for the DBus object path.
 *
 * @param {string} input
 * @returns {number}
 */
function simpleHash(input) {
  let h = 0;
  for (const codePoint of input) {
    h = (h * 31 + codePoint.codePointAt(0)) >>> 0;
  }
  return h;
}

module.exports = { update, computeDesktopUri };

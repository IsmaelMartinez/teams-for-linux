/**
 * KDE / freedesktop JobView emitter.
 *
 * Reports download progress to the desktop's "job tracker" service so it
 * shows up in KDE Plasma's notification widget (the same place users see
 * Firefox / Dolphin / Discover / kio job progress). Bypasses Electron's
 * Unity LauncherEntry path entirely — that protocol depends on the user
 * having a Task Manager applet *and* on KDE's libtaskmanager actually
 * rendering it, neither of which can be assumed.
 *
 * The JobView protocol (`org.kde.JobViewServer` on the session bus):
 *   - `requestView(appName, appIconName, capabilities) → object_path`
 *   - on the returned path, methods on `org.kde.JobViewV2`:
 *       `setInfoMessage(string)`           — short status line
 *       `setTotalAmount(uint64, string)`   — total work, e.g. (size, "bytes")
 *       `setProcessedAmount(uint64, string)` — done so far in same units
 *       `setPercent(uint32)`               — 0..100
 *       `setDescriptionField(uint32 number, string label, string value)`
 *       `terminate(string errorMessage)`   — empty string = success
 *
 * `org.kde.JobViewServer` is implemented by KDE's Plasma notification
 * manager; if it isn't on the bus (e.g. GNOME without an extension that
 * provides it, sway, etc.) `requestView` fails and the emitter degrades
 * to no-op. The window-title fallback in `DownloadManager` still gives
 * those users feedback.
 *
 * The `appIconName` reported to KDE follows the running packaging:
 *   - deb / rpm / source: `teams-for-linux` (matches the .desktop ID).
 *   - Flatpak: the Flatpak app id from `FLATPAK_ID` (e.g.
 *     `com.github.IsmaelMartinez.teams_for_linux`).
 *   - Snap: the snap instance name from `SNAP_INSTANCE_NAME` / `SNAP_NAME`.
 * Plasma resolves the name against the running session's icon theme; an
 * unmatched name renders the JobView row with no icon, which is cosmetic
 * but not a failure.
 */

const dbus = require("@homebridge/dbus-native");

const SERVICE = "org.kde.JobViewServer";
const SERVER_PATH = "/JobViewServer";
const SERVER_IFACE = "org.kde.JobViewServer";
const VIEW_IFACE = "org.kde.JobViewV2";

let bus = null;
let busDisabled = false;

function detectAppIconName() {
  // Flatpak: the runtime sets FLATPAK_ID to the app id, which is also the
  // canonical name of the bundled icon file.
  if (process.env.FLATPAK_ID) return process.env.FLATPAK_ID;
  // Snap: SNAP_INSTANCE_NAME is the parallel-install-aware name; SNAP_NAME
  // is the bare package name. Both have a matching icon in the snap
  // meta/gui directory.
  if (process.env.SNAP_INSTANCE_NAME) return process.env.SNAP_INSTANCE_NAME;
  if (process.env.SNAP_NAME) return process.env.SNAP_NAME;
  return "teams-for-linux";
}

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
 * Open a JobView for a single download. Calls the JobView server's
 * `requestView` method and resolves with a handle that exposes
 * `update({ receivedBytes, totalBytes })` and `finish({ error? })`.
 *
 * If the JobView server is unavailable the returned handle's methods are
 * no-ops, so callers can use the same code path on every Linux setup.
 *
 * @param {{appName?: string, appIconName?: string, filename: string, totalBytes?: number}} options
 * @returns {Promise<{update: (Object) => void, finish: (Object) => void}>}
 */
async function start(options) {
  const sessionBus = getBus();
  if (!sessionBus) return noopHandle();

  const appName = options.appName ?? "Teams for Linux";
  const appIconName = options.appIconName ?? detectAppIconName();

  // `capabilities` is a bitfield: 1 = Cancelable, 2 = Suspendable. We pass
  // 0 deliberately — DownloadItem.cancel() / .pause() are not currently
  // wired to IPC, so advertising those buttons in Plasma's notification
  // widget would mislead the user. If we ever expose them, change this
  // to 3 and bind the JobView's `cancelRequested` / `suspendRequested`
  // signals to the matching DownloadItem methods.
  const viewPath = await invoke(sessionBus, {
    destination: SERVICE,
    path: SERVER_PATH,
    interface: SERVER_IFACE,
    member: "requestView",
    signature: "ssi",
    body: [appName, appIconName, 0],
  }).catch((error) => {
    // Most common failure: JobViewServer isn't on the bus (no Plasma /
    // notification daemon). Disable for the rest of the process so we
    // don't keep retrying the request.
    console.warn("[DownloadManager] JobViewServer unavailable", {
      message: error?.message ?? String(error),
    });
    busDisabled = true;
    return null;
  });

  if (!viewPath) return noopHandle();

  if (options.filename) {
    invoke(sessionBus, {
      destination: SERVICE,
      path: viewPath,
      interface: VIEW_IFACE,
      member: "setInfoMessage",
      signature: "s",
      body: [`Downloading ${options.filename}`],
    }).catch(noopReject);
    invoke(sessionBus, {
      destination: SERVICE,
      path: viewPath,
      interface: VIEW_IFACE,
      member: "setDescriptionField",
      signature: "uss",
      body: [0, "File", options.filename],
    }).catch(noopReject);
  }

  if (typeof options.totalBytes === "number" && options.totalBytes > 0) {
    invoke(sessionBus, {
      destination: SERVICE,
      path: viewPath,
      interface: VIEW_IFACE,
      member: "setTotalAmount",
      signature: "ts",
      body: [options.totalBytes, "bytes"],
    }).catch(noopReject);
  }

  let finished = false;
  return {
    update({ receivedBytes, totalBytes }) {
      if (finished) return;
      const total = typeof totalBytes === "number" ? totalBytes : 0;
      const received = typeof receivedBytes === "number" ? receivedBytes : 0;

      if (total > 0) {
        const percent = Math.max(0, Math.min(100, Math.round((received * 100) / total)));
        invoke(sessionBus, {
          destination: SERVICE,
          path: viewPath,
          interface: VIEW_IFACE,
          member: "setPercent",
          signature: "u",
          body: [percent],
        }).catch(noopReject);
        invoke(sessionBus, {
          destination: SERVICE,
          path: viewPath,
          interface: VIEW_IFACE,
          member: "setProcessedAmount",
          signature: "ts",
          body: [received, "bytes"],
        }).catch(noopReject);
      }
    },
    finish({ error } = {}) {
      if (finished) return;
      finished = true;
      invoke(sessionBus, {
        destination: SERVICE,
        path: viewPath,
        interface: VIEW_IFACE,
        member: "terminate",
        signature: "s",
        body: [error ?? ""],
      }).catch(noopReject);
    },
  };
}

function noopHandle() {
  return {
    update() {},
    finish() {},
  };
}

function noopReject() {
  // Each invoke is fire-and-forget; swallow per-method errors so a single
  // dropped DBus call doesn't tear the manager down.
}

/**
 * Promise wrapper around `bus.invoke`.
 *
 * @param {object} sessionBus
 * @param {object} message
 */
function invoke(sessionBus, message) {
  return new Promise((resolve, reject) => {
    sessionBus.invoke(message, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

module.exports = { start };

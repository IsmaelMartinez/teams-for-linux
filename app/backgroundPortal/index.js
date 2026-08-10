/**
 * xdg-desktop-portal Background integration (issue #2815).
 *
 * GNOME's "Background Apps" menu (GNOME 44+) lists windowless Flatpak apps
 * automatically via the portal's background monitor, so the app does not need
 * to register to appear there. What calling the portal adds:
 *
 *   - `RequestBackground` records the background permission in the portal's
 *     permission store, which suppresses the recurring "running in the
 *     background" Allow/Forbid prompt cycle. An app the user forbade gets
 *     SIGKILLed by the portal whenever it runs windowless, so surfacing the
 *     request once, with a reason, is strictly better than never asking.
 *   - `SetStatus` (portal version 2+) puts a short status line under the
 *     app's entry in the Background Apps menu.
 *
 * Both calls are only meaningful inside a Flatpak sandbox: the background
 * monitor enumerates Flatpak instances exclusively, and `SetStatus` rejects
 * host callers. Snap and native installs are unaffected, hence the
 * `FLATPAK_ID` gate.
 *
 * Electron has no built-in support for this portal (electron#32388), so the
 * calls go over D-Bus directly, same as `app/intune` and the download
 * manager's emitters.
 */

const PORTAL_SERVICE = "org.freedesktop.portal.Desktop";
const PORTAL_PATH = "/org/freedesktop/portal/desktop";
const BACKGROUND_INTERFACE = "org.freedesktop.portal.Background";
const REQUEST_INTERFACE = "org.freedesktop.portal.Request";
// Shown by the portal backend in the permission dialog / notification.
const REQUEST_REASON =
  "Show notifications and keep calls ringing while the window is closed";
// Shown under the app entry in GNOME's Background Apps menu. Portal limit is
// 96 characters, single line.
const STATUS_MESSAGE = "Running in background";
// The response may sit behind a user-facing permission dialog, so the wait is
// generous. After the timeout we only stop listening; nothing is aborted.
const RESPONSE_TIMEOUT_MS = 30000;

/**
 * Request the background permission and, when granted on a v2+ portal, set
 * the background status message. Fire-and-forget: every failure degrades to
 * a warn/debug log, never to a startup error.
 *
 * @returns {boolean} whether the integration was attempted
 */
function init() {
  if (process.platform !== "linux" || !process.env.FLATPAK_ID) {
    return false;
  }

  // Lazy require after the gate, same as the download-manager emitters, so
  // non-Linux startups never load the D-Bus stack.
  let dbus;
  try {
    dbus = require("@homebridge/dbus-native");
  } catch (error) {
    console.warn("[BackgroundPortal] dbus module unavailable", {
      message: error.message,
    });
    return false;
  }

  let sessionBus;
  try {
    sessionBus = dbus.sessionBus();
  } catch (error) {
    console.warn("[BackgroundPortal] dbus sessionBus unavailable", {
      message: error.message,
    });
    return false;
  }

  getPortalVersion(sessionBus, (version) => {
    console.debug(`[BackgroundPortal] Portal version ${version}`);
    requestBackground(sessionBus, (responseCode) => {
      console.info(
        `[BackgroundPortal] RequestBackground response=${responseCode}`
      );
      if (responseCode === 0 && version >= 2) {
        setStatus(sessionBus);
      }
    });
  });
  return true;
}

/**
 * Read the Background interface version property. Reports 1 when the probe
 * fails, which keeps behaviour on the v1 path (no SetStatus).
 */
function getPortalVersion(sessionBus, callback) {
  sessionBus.invoke(
    {
      destination: PORTAL_SERVICE,
      path: PORTAL_PATH,
      interface: "org.freedesktop.DBus.Properties",
      member: "Get",
      signature: "ss",
      body: [BACKGROUND_INTERFACE, "version"],
    },
    (error, result) => {
      if (error) {
        console.warn("[BackgroundPortal] Version probe failed", {
          message: String(error),
        });
        callback(1);
        return;
      }
      // dbus-native marshals a variant as [signatureTree, [value]].
      const raw = Array.isArray(result) ? result[1]?.[0] : result;
      const version = Number(raw);
      callback(Number.isFinite(version) ? version : 1);
    }
  );
}

/**
 * Call RequestBackground and wait for the portal's asynchronous Response
 * signal. The signal arrives on a Request object path ending in our
 * handle_token, which is how the reply is matched without computing the
 * sender-scoped path (that would race the method return anyway).
 */
function requestBackground(sessionBus, callback) {
  const token = `tfl${Date.now().toString(36)}`;
  const matchRule = `type='signal',interface='${REQUEST_INTERFACE}',member='Response'`;
  let done = false;

  const finish = (responseCode) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    sessionBus.connection.removeListener("message", onMessage);
    sessionBus.removeMatch?.(matchRule, () => {});
    if (responseCode !== null) {
      callback(responseCode);
    }
  };

  const onMessage = (msg) => {
    if (msg?.interface !== REQUEST_INTERFACE || msg?.member !== "Response") {
      return;
    }
    if (typeof msg.path !== "string" || !msg.path.endsWith(`/${token}`)) {
      return;
    }
    // Response signature is (ua{sv}); body[0] is 0 granted, 1 dismissed,
    // 2 error.
    const code = Array.isArray(msg.body) ? Number(msg.body[0]) : Number.NaN;
    finish(Number.isFinite(code) ? code : 2);
  };

  const timer = setTimeout(() => {
    console.debug("[BackgroundPortal] No Response signal before timeout");
    finish(null);
  }, RESPONSE_TIMEOUT_MS);
  timer.unref?.();

  sessionBus.connection.on("message", onMessage);
  sessionBus.addMatch(
    matchRule,
    (matchError) => {
      if (matchError) {
        console.warn("[BackgroundPortal] addMatch failed", {
          message: String(matchError),
        });
        finish(null);
        return;
      }
      sessionBus.invoke(
        {
          destination: PORTAL_SERVICE,
          path: PORTAL_PATH,
          interface: BACKGROUND_INTERFACE,
          member: "RequestBackground",
          signature: "sa{sv}",
          body: [
            // Empty parent window: the request is not anchored to a window,
            // which the portal accepts.
            "",
            [
              ["handle_token", ["s", token]],
              ["reason", ["s", REQUEST_REASON]],
            ],
          ],
        },
        (error) => {
          if (error) {
            console.warn("[BackgroundPortal] RequestBackground failed", {
              message: String(error),
            });
            finish(null);
          }
        }
      );
    }
  );
}

function setStatus(sessionBus) {
  sessionBus.invoke(
    {
      destination: PORTAL_SERVICE,
      path: PORTAL_PATH,
      interface: BACKGROUND_INTERFACE,
      member: "SetStatus",
      signature: "a{sv}",
      body: [[["message", ["s", STATUS_MESSAGE]]]],
    },
    (error) => {
      if (error) {
        console.warn("[BackgroundPortal] SetStatus failed", {
          message: String(error),
        });
        return;
      }
      console.debug("[BackgroundPortal] Status message set");
    }
  );
}

module.exports = { init };

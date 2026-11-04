const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { isTeamsHost } = require("../helpers/teamsHosts");

const APP_ROOT = path.join(__dirname, "..");

// Without these handlers Electron grants every permission request, so any
// page opened in an app window (a popup from a profile view, a link opened
// in-app, a navigation away from Teams) could use the microphone, camera or
// notifications without a prompt (GHSA-58j7-22f8-6xqp).
//
// A request is granted when either the window's top-level page or the
// requesting origin is trusted. The top-level check keeps the apps Teams
// embeds in iframes (Whiteboard, Loop, SharePoint) working, since Teams
// already decides what to embed; the requester check covers the Document
// PiP about:blank window, which inherits the Teams origin.

const AUTH_LOGIN_HOSTS = ["login.microsoftonline.com", "login.microsoft.com", "login.live.com"];

function originOf(url) {
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Whether a page or requester URL may use device permissions.
 * @param {string} url - a page URL or an origin
 * @param {Set<string>} trustedOrigins - the configured URL and profile URL origins
 * @returns {boolean}
 */
function isTrustedUrl(url, trustedOrigins) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (trustedOrigins.has(parsed.origin)) return true;
  // The app's own local pages (picker, dialogs, toasts), as in isSenderAllowed.
  if (parsed.protocol === "file:") {
    try {
      return fileURLToPath(parsed).startsWith(APP_ROOT + path.sep);
    } catch {
      return false;
    }
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  return isTeamsHost(host) || AUTH_LOGIN_HOSTS.some((d) => host === d || host.endsWith("." + d));
}

/**
 * Pure decision used by both handlers.
 * @param {{ topLevelUrl?: string, requestingUrl?: string }} request
 * @param {Set<string>} trustedOrigins
 * @returns {boolean}
 */
function isPermissionAllowed({ topLevelUrl, requestingUrl }, trustedOrigins) {
  return (
    (typeof topLevelUrl === "string" && isTrustedUrl(topLevelUrl, trustedOrigins)) ||
    (typeof requestingUrl === "string" && isTrustedUrl(requestingUrl, trustedOrigins))
  );
}

function topLevelUrlOf(webContents) {
  try {
    return webContents?.getURL();
  } catch {
    return undefined;
  }
}

/**
 * Install permission handlers on the default session and on every session
 * created later (profile partitions).
 * @param {object} config - app config; `url` is trusted alongside the Teams hosts
 * @param {Electron.App} app
 * @param {Electron.Session} defaultSession
 * @param {() => string[]} [getProfileUrls] - custom profile URLs, read per request
 */
function installPermissionHandlers(config, app, defaultSession, getProfileUrls = () => []) {
  const trustedOrigins = () =>
    new Set([config.url, ...getProfileUrls()].map(originOf).filter(Boolean));
  const deniedOrigins = new Set();

  const decide = (webContents, permission, requestingUrl) => {
    const allowed = isPermissionAllowed(
      { topLevelUrl: topLevelUrlOf(webContents), requestingUrl },
      trustedOrigins(),
    );
    const origin = originOf(requestingUrl) ?? "unknown";
    if (!allowed && !deniedOrigins.has(`${permission}|${origin}`)) {
      deniedOrigins.add(`${permission}|${origin}`);
      console.warn("[PERMISSIONS] Denied permission for an untrusted origin", { permission, origin });
    }
    return allowed;
  };

  const applyTo = (targetSession) => {
    try {
      targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        callback(decide(webContents, permission, details?.requestingUrl));
      });
      targetSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) =>
        decide(webContents, permission, requestingOrigin),
      );
    } catch (error) {
      console.error("[PERMISSIONS] Could not install permission handlers", { message: error.message });
    }
  };

  if (defaultSession) applyTo(defaultSession);
  app.on("session-created", applyTo);
}

module.exports = { installPermissionHandlers, isPermissionAllowed, isTrustedUrl };

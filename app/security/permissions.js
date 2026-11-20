const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { isTeamsHost } = require("../helpers/teamsHosts");
const { isSafeExternalUrl, schemeOf } = require("../helpers/externalUrl");

const APP_ROOT = path.join(__dirname, "..");

// Without these handlers Electron grants every permission request, so any
// page opened in an app window (a popup from a profile view, a link opened
// in-app, a navigation away from Teams) could use the microphone, camera or
// notifications without a prompt (GHSA-58j7-22f8-6xqp).
//
// A request is granted when the requester itself is trusted. A cross-origin
// frame inside a trusted page (Whiteboard, Loop, SharePoint embedded by Teams)
// only inherits the permissions Chromium already gates per frame with
// Permissions Policy; the rest (notifications, device APIs, file system) need
// a trusted requester. Opening external apps is narrower: a trusted requester
// may open only the schemes in helpers/externalUrl.js, and any other main
// frame only mail and phone links.

const AUTH_LOGIN_HOSTS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.live.com",
  "login.microsoftonline.us",
];
// GCC High and DoD serve Teams outside the commercial hosts isTeamsHost knows.
const GOV_TEAMS_DOMAIN = "teams.microsoft.us";

// Teams accessed through Microsoft Defender for Cloud Apps (MCAS).
const MCAS_TEAMS_DOMAIN = "teams.cloud.microsoft.mcas-gov.ms";

const FRAME_POLICY_GATED = new Set([
  "media",
  "display-capture",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
]);

// Schemes any main frame may hand to the system without a trusted requester.
const OPEN_EXTERNAL_ANY_PAGE = new Set(["mailto:", "tel:"]);

const MAX_LOGGED_DENIALS = 100;

function originOf(url) {
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith("." + domain);
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
  return (
    isTeamsHost(host) ||
    hostMatches(host, GOV_TEAMS_DOMAIN) ||
    hostMatches(host, MCAS_TEAMS_DOMAIN) ||
    AUTH_LOGIN_HOSTS.some((d) => hostMatches(host, d))
  );
}

/**
 * Pure decision used by both handlers.
 * @param {{ permission: string, isMainFrame?: boolean, topLevelUrl?: string, requestingUrl?: string, externalURL?: string }} request
 * @param {Set<string>} trustedOrigins
 * @returns {boolean}
 */
function isPermissionAllowed({ permission, isMainFrame, topLevelUrl, requestingUrl, externalURL }, trustedOrigins) {
  const trustedRequester = typeof requestingUrl === "string" && isTrustedUrl(requestingUrl, trustedOrigins);
  if (permission === "openExternal") {
    if (trustedRequester) return isSafeExternalUrl(externalURL);
    return Boolean(isMainFrame) && OPEN_EXTERNAL_ANY_PAGE.has(schemeOf(externalURL));
  }
  if (trustedRequester) return true;
  return (
    FRAME_POLICY_GATED.has(permission) &&
    typeof topLevelUrl === "string" &&
    isTrustedUrl(topLevelUrl, trustedOrigins)
  );
}

// Local pages report a bare `file:///` origin, which says nothing about which
// file asked; their requestingUrl carries the path isTrustedUrl checks against
// the app directory. Web pages keep the origin, which for the about:blank PiP
// window is the inherited Teams origin.
function requesterOf(details, origin) {
  const url = details?.requestingUrl;
  return typeof url === "string" && url.startsWith("file:") ? url : origin;
}

// Logged instead of the origin, which can name a tenant's identity provider.
function schemeLabel(url) {
  return schemeOf(url)?.slice(0, -1) ?? "unknown";
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
  const loggedDenials = new Set();

  const decide = (webContents, permission, details, requestingUrl) => {
    const allowed = isPermissionAllowed(
      {
        permission,
        isMainFrame: details?.isMainFrame,
        topLevelUrl: topLevelUrlOf(webContents),
        requestingUrl,
        externalURL: details?.externalURL,
      },
      trustedOrigins(),
    );
    // A refused link is about the link, not the page: a trusted page is
    // refused too when the link's scheme is not one the app opens.
    const refusedLink = permission === "openExternal";
    const linkScheme = refusedLink ? schemeLabel(details?.externalURL) : "";
    const key = `${permission}|${originOf(requestingUrl) ?? "unknown"}|${linkScheme}`;
    if (!allowed && loggedDenials.size < MAX_LOGGED_DENIALS && !loggedDenials.has(key)) {
      loggedDenials.add(key);
      if (refusedLink) {
        console.warn("[PERMISSIONS] Refused to open an external link", { scheme: linkScheme });
      } else {
        console.warn("[PERMISSIONS] Denied permission for an untrusted origin", {
          permission,
          scheme: schemeLabel(requestingUrl),
        });
      }
    }
    return allowed;
  };

  const applyTo = (targetSession) => {
    try {
      // For the about:blank Document PiP window requestingUrl is about:blank,
      // while securityOrigin carries the inherited Teams origin.
      targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const origin = details?.securityOrigin || details?.requestingUrl;
        callback(decide(webContents, permission, details, requesterOf(details, origin)));
      });
      targetSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
        decide(webContents, permission, details, requesterOf(details, requestingOrigin)),
      );
    } catch (error) {
      console.error("[PERMISSIONS] Could not install permission handlers", { message: error.message });
    }
  };

  if (defaultSession) applyTo(defaultSession);
  app.on("session-created", applyTo);
}

module.exports = { installPermissionHandlers, isPermissionAllowed, isTrustedUrl };

// app/security/navigationGuard.js

const { normalizeOrigin } = require("../webauthn/originAllowlist");
const { isLoginUrl } = require("../ssoPasswordPrefill");

// The preload runs on every top-level page the Teams window shows, so a page it
// has been navigated to (through a redirect, or by script in the Teams page)
// keeps the preload's IPC reach. The guard watches main-frame navigations and
// redirects away from the sites the user trusts (ADR-035). By default it only
// observes; with `urlHandling.navigationLock.enabled` it cancels them.

// Cap on the origins remembered for the observe-mode log, so a page that keeps
// minting origins cannot grow the set without bound.
const MAX_SEEN_ORIGINS = 50;

const SETTING = "urlHandling.navigationLock.enabled";

// What the user sees and logs for an origin: the opaque ones (data:, an
// about: page, a file outside the app) have no host to show, so their scheme
// stands in.
function describeUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      origin: parsed.origin === "null" ? parsed.protocol : parsed.origin,
      scheme: parsed.protocol.slice(0, -1),
    };
  } catch {
    return { origin: "unparseable", scheme: "unknown" };
  }
}

function normalizedOrigins(entries) {
  const origins = new Set();
  let rejected = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const origin = normalizeOrigin(entry);
    if (origin) origins.add(origin);
    else rejected += 1;
  }
  return { origins, rejected };
}

/**
 * Create a navigation guard shared by every webContents it is attached to, so
 * "once per origin" and "once per session" hold across the Teams window and the
 * profile views.
 *
 * @param {object} deps
 * @param {object} deps.config - app config
 * @param {(url: string) => boolean} deps.isTrustedPage - the trusted-page
 *   predicate also used for the IPC sender check
 * @param {(origin: string) => void} [deps.onBlocked] - called with the origin
 *   of each blocked navigation (enabled mode only)
 * @param {{ info: Function, warn: Function }} [deps.logger] - defaults to console
 * @returns {{ isTrustedDestination: (url: string) => boolean,
 *             attach: (webContents: import("electron").WebContents) => void }}
 */
function createNavigationGuard({ config, isTrustedPage, onBlocked = () => {}, logger = console }) {
  const enabled = config?.urlHandling?.navigationLock?.enabled === true;
  const lockOrigins = normalizedOrigins(config?.urlHandling?.navigationLock?.extraOrigins);
  const webauthnOrigins = normalizedOrigins(config?.auth?.webauthn?.extraOrigins);
  const declaredOrigins = new Set([...lockOrigins.origins, ...webauthnOrigins.origins]);
  const loginHosts = config?.auth?.webLogin?.extraHosts;
  if (lockOrigins.rejected > 0) {
    // The count only: an identity provider host identifies the tenant.
    logger.warn("[NAV_LOCK] Ignored malformed urlHandling.navigationLock.extraOrigins entries", {
      rejected: lockOrigins.rejected,
    });
  }

  const seenOrigins = new Set();
  let hinted = false;

  function isTrustedDestination(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.href === "about:blank") return true;
    // A blob: URL is judged by the origin that created it. Its inner origin is
    // not a URL with a host of its own, so the origin string is what gets checked.
    const judged = parsed.protocol === "blob:" ? parsed.origin : url;
    if (judged === "null") return false;
    if (declaredOrigins.has(parsed.origin)) return true;
    try {
      return isTrustedPage(judged) === true || isLoginUrl(judged, loginHosts);
    } catch {
      return false;
    }
  }

  function observe(url, kind) {
    const { origin, scheme } = describeUrl(url);
    if (seenOrigins.has(origin) || seenOrigins.size >= MAX_SEEN_ORIGINS) return;
    seenOrigins.add(origin);
    logger.info("[NAV_LOCK] The Teams window left its trusted sites; nothing was blocked", { scheme, kind });
    if (!hinted) {
      hinted = true;
      logger.info(`[NAV_LOCK] Set ${SETTING} to true to block this; list sign-in sites in urlHandling.navigationLock.extraOrigins`);
    }
  }

  function block(details, kind) {
    details.preventDefault();
    const { origin, scheme } = describeUrl(details.url);
    logger.warn("[NAV_LOCK] Blocked a navigation to an untrusted site", { scheme, kind });
    try {
      onBlocked(origin);
    } catch {
      logger.warn("[NAV_LOCK] Could not report the blocked navigation");
    }
  }

  const handle = (kind) => (details) => {
    if (!details?.isMainFrame || typeof details.url !== "string") return;
    if (isTrustedDestination(details.url)) return;
    if (enabled) block(details, kind);
    else observe(details.url, kind);
  };

  function attach(webContents) {
    webContents.on("will-navigate", handle("navigation"));
    // A server redirect, including one inside a load the app started itself.
    webContents.on("will-redirect", handle("redirect"));
  }

  return { isTrustedDestination, attach };
}

module.exports = { createNavigationGuard };

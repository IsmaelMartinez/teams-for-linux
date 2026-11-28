// The one place that names the Teams and Microsoft host lists, by purpose, and
// the matchers that decide who may use them. Loaded by the preload, so this
// stays a pure module: no Node or Electron requires.
//
// Callers differ on purpose in three ways, and each matcher below says which
// way it goes. Government hosts: only the permission check knows
// teams.microsoft.us and login.microsoftonline.us. MCAS proxy suffixes: the
// Teams, sign-in and cookie matchers strip them; the sign-in prefill does not,
// and the permission check strips them only for the Teams hosts it takes from
// isTeamsHost, not for its government and sign-in hosts. Depth: isTeamsHost
// allows one label in front of a host (so the permission check does too, for
// Teams hosts), the WebAuthn origins are exact, everything else allows any
// depth. Do not make these consistent without a policy decision.
//
// Deliberately NOT routed through this module, because each is a single-purpose
// list or an exact check, not a statement about which hosts are Teams or
// Microsoft:
// - MS_TELEMETRY_HOSTS in mainAppWindow/index.js and the URL preview host in
//   mainAppWindow/urlPreviewBlock.js: block lists for one endpoint each.
// - POLICY_HOST_HINTS in downloadManager/index.js: only tailors the wording of
//   a failed download notification (it does use hasDomainSuffix).
// - The login.microsoftonline.com prefix checks in intune/index.js and
//   mainAppWindow/signOutReload.js: one exact host on purpose.
// - The custom background CDN prefix in customBackground/index.js.
// - METADATA_PAGES in webauthn/browserBackend.js: a per-origin path table; a
//   unit test pins its keys to SIGN_IN_HOSTS.

// The hosts the Teams SPA is served from. Tenants behind Defender for Cloud
// Apps load it at `<host>.mcas.ms`, which counts as the underlying host.
const TEAMS_HOSTS = ["teams.cloud.microsoft", "teams.microsoft.com", "teams.live.com"];

// Government clouds (GCC High, DoD) serve Teams from here, outside TEAMS_HOSTS.
const GOV_TEAMS_DOMAIN = "teams.microsoft.us";

// Static content host for the Teams web app; part of "serves Teams content".
const TEAMS_STATIC_HOST = "statics.teams.cdn.office.net";

// Microsoft Identity Platform sign-in hosts. Also the exact origins WebAuthn
// serves (webauthn/originAllowlist.js, webauthn/log.js) and the built-in hosts
// of the sign-in prefill.
const SIGN_IN_HOSTS = ["login.microsoftonline.com", "login.microsoft.com", "login.live.com"];

// Government sign-in host. Only the permission check trusts it.
const GOV_SIGN_IN_HOST = "login.microsoftonline.us";

// Broad parent domains whose cookies the auth recovery inspects and cleans.
// Far wider than the sign-in hosts, because auth cookies are scoped to parents.
const AUTH_COOKIE_DOMAINS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "teams.microsoft.com",
  "teams.cloud.microsoft",
  "microsoft.com",
  "office.com",
  "office365.com",
  "live.com",
  "microsoftonline.com",
];

// Hosts whose renderer scripts may raise an auth-failure signal. Differs from
// SIGN_IN_HOSTS (no login.microsoft.com or login.live.com) and from TEAMS_HOSTS
// (no teams.live.com); whether to add teams.live.com is an open decision.
const TRUSTED_AUTH_SOURCE_HOSTS = [
  "teams.cloud.microsoft",
  "teams.microsoft.com",
  "login.microsoftonline.com",
];

// Microsoft Defender for Cloud Apps (MCAS) proxies Teams through these
// domain suffixes. Strip the recognized suffix before validating the
// hostname against known Teams domains above.
const MCAS_SUFFIXES = [".mcas.ms", ".mcas-gov.us", ".mcas-gov.ms"];

/**
 * Any-depth suffix test: the host is the domain or ends with "." plus the
 * domain. The one primitive behind every any-depth matcher.
 *
 * @param {string} hostname - Lower-case hostname, as `URL.hostname` yields it
 * @param {string} domain
 * @returns {boolean}
 */
function hasDomainSuffix(hostname, domain) {
  return hostname === domain || hostname.endsWith("." + domain);
}

/**
 * @param {string} hostname - Lower-case hostname, as `URL.hostname` yields it
 * @param {string[]} domains
 * @returns {boolean}
 */
function hasAnyDomainSuffix(hostname, domains) {
  return domains.some((domain) => hasDomainSuffix(hostname, domain));
}

/**
 * Strips a recognized Microsoft Defender for Cloud Apps (MCAS) proxy suffix
 * from a hostname, returning the underlying hostname. Hostnames without a
 * recognized suffix are returned unchanged.
 *
 * @param {string} hostname - Lower-case hostname, as `URL.hostname` yields it
 * @returns {string} - Hostname without the MCAS suffix
 */
function stripMcasSuffix(hostname) {
  if (typeof hostname !== "string") {
    return hostname;
  }

  const suffix = MCAS_SUFFIXES.find((suffix) => hostname.endsWith(suffix));
  return suffix ? hostname.slice(0, -suffix.length) : hostname;
}

/**
 * Whether a hostname is one of the Teams hosts or an immediate subdomain of
 * one. Only one label is allowed in front, so `evil.com.teams.microsoft.com`
 * does not pass. MCAS suffix stripped. Used by the permission check, the deep
 * link router, the preload, the React handler, the profile navigation check
 * and the menu's meeting URL check.
 *
 * @param {string} hostname - Lower-case hostname, as `URL.hostname` yields it
 * @returns {boolean}
 */
function isTeamsHost(hostname) {
  if (typeof hostname !== "string") {
    return false;
  }

  hostname = stripMcasSuffix(hostname);
  return TEAMS_HOSTS.some(
    (domain) =>
      hostname === domain ||
      (hostname.endsWith("." + domain) &&
        !hostname.slice(0, -(domain.length + 1)).includes(".")),
  );
}

/**
 * Hostname of a URL string, or null when it does not parse.
 * @param {string} url
 * @returns {string|null}
 */
function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Whether a URL is served from a host that serves Teams content: a Teams host
 * or the static content host, at any depth, MCAS suffix stripped. Decides which
 * responses keep their report-only CSP header (mainAppWindow/index.js).
 *
 * @param {string} url
 * @returns {boolean}
 */
function isTeamsContentUrl(url) {
  const hostname = hostnameOf(url);
  return (
    hostname !== null &&
    hasAnyDomainSuffix(stripMcasSuffix(hostname), [...TEAMS_HOSTS, TEAMS_STATIC_HOST])
  );
}

/**
 * Whether a URL targets a Microsoft sign-in page: one of SIGN_IN_HOSTS at any
 * depth, MCAS suffix stripped. Government sign-in is not included. Used to
 * intercept re-auth popups (mainAppWindow/index.js).
 *
 * @param {string} url
 * @returns {boolean}
 */
function isAuthLoginUrl(url) {
  const hostname = hostnameOf(url);
  return hostname !== null && hasAnyDomainSuffix(stripMcasSuffix(hostname), SIGN_IN_HOSTS);
}

/**
 * Whether an auth-failure signal came from a trusted script URL: its host,
 * MCAS suffix stripped, is one of TRUSTED_AUTH_SOURCE_HOSTS or a subdomain.
 * A `blob:` URL is judged by the origin it embeds, since Teams creates workers
 * from blob URLs. An unparseable source is rejected; callers skip this check
 * for an empty source.
 *
 * @param {string} source - Script URL from a console message or window error
 * @returns {boolean}
 */
function isTrustedAuthSource(source) {
  try {
    const url = new URL(source);
    const hostname = url.protocol === "blob:" ? new URL(url.origin).hostname : url.hostname;
    return hasAnyDomainSuffix(stripMcasSuffix(hostname), TRUSTED_AUTH_SOURCE_HOSTS);
  } catch {
    return false;
  }
}

/**
 * Whether a cookie domain belongs to a Microsoft auth cookie scope: one of
 * AUTH_COOKIE_DOMAINS at any depth, leading dot and MCAS suffix stripped.
 *
 * @param {string} cookieDomain - `cookie.domain`, possibly with a leading dot
 * @returns {boolean}
 */
function isAuthCookieDomain(cookieDomain) {
  const domain = stripMcasSuffix((cookieDomain || "").replace(/^\./, ""));
  return hasAnyDomainSuffix(domain, AUTH_COOKIE_DOMAINS);
}

/**
 * Whether the permission check trusts a host: a Teams host, the government
 * Teams domain, or a sign-in host including the government one. Any depth and
 * no MCAS strip for the last two, unlike isTeamsHost. Used by
 * security/permissions.js.
 *
 * @param {string} hostname - Lower-case hostname, as `URL.hostname` yields it
 * @returns {boolean}
 */
function isPermissionTrustedHost(hostname) {
  return (
    isTeamsHost(hostname) ||
    hasAnyDomainSuffix(hostname, [GOV_TEAMS_DOMAIN, ...SIGN_IN_HOSTS, GOV_SIGN_IN_HOST])
  );
}

/**
 * Whether a hostname is a login page the SSO prefill may act on: SIGN_IN_HOSTS
 * or the user's extra hosts, any depth, no MCAS strip. The caller adds the
 * https check; this gate decides where a password is injected.
 *
 * @param {string} hostname - Lower-case hostname, as `URL.hostname` yields it
 * @param {string[]} [extraHosts] - Additional host suffixes from config
 * @returns {boolean}
 */
function isPrefillLoginHost(hostname, extraHosts = []) {
  return hasAnyDomainSuffix(hostname, [...SIGN_IN_HOSTS, ...extraHosts]);
}

module.exports = {
  TEAMS_HOSTS,
  GOV_TEAMS_DOMAIN,
  TEAMS_STATIC_HOST,
  SIGN_IN_HOSTS,
  GOV_SIGN_IN_HOST,
  AUTH_COOKIE_DOMAINS,
  TRUSTED_AUTH_SOURCE_HOSTS,
  MCAS_SUFFIXES,
  hasDomainSuffix,
  hasAnyDomainSuffix,
  stripMcasSuffix,
  isTeamsHost,
  isTeamsContentUrl,
  isAuthLoginUrl,
  isTrustedAuthSource,
  isAuthCookieDomain,
  isPermissionTrustedHost,
  isPrefillLoginHost,
};

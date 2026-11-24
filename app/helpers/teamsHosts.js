// The hosts the Teams SPA is served from. Tenants behind Defender for Cloud
// Apps load it at `<host>.mcas.ms`, which counts as the underlying host.
const TEAMS_HOSTS = ["teams.cloud.microsoft", "teams.microsoft.com", "teams.live.com"];

// Microsoft Defender for Cloud Apps (MCAS) proxies Teams through these
// domain suffixes. Strip the recognized suffix before validating the
// hostname against known Teams domains above.
const MCAS_SUFFIXES = [".mcas.ms", ".mcas-gov.us", ".mcas-gov.ms"];

/**
 * Whether a hostname is one of the Teams hosts or an immediate subdomain of
 * one. Only one label is allowed in front, so `evil.com.teams.microsoft.com`
 * does not pass.
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

module.exports = { TEAMS_HOSTS, isTeamsHost, stripMcasSuffix };

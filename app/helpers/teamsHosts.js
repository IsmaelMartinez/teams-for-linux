// The hosts the Teams SPA is served from. Tenants behind Defender for Cloud
// Apps load it at `<host>.mcas.ms`, which counts as the underlying host.
const TEAMS_HOSTS = ["teams.cloud.microsoft", "teams.microsoft.com", "teams.live.com"];
const MCAS_SUFFIX = ".mcas.ms";

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
  if (hostname.endsWith(MCAS_SUFFIX)) {
    hostname = hostname.slice(0, -MCAS_SUFFIX.length);
  }
  return TEAMS_HOSTS.some(
    (domain) =>
      hostname === domain ||
      (hostname.endsWith("." + domain) &&
        !hostname.slice(0, -(domain.length + 1)).includes(".")),
  );
}

module.exports = { TEAMS_HOSTS, isTeamsHost };

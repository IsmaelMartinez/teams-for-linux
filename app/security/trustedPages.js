// app/security/trustedPages.js

const { isTrustedUrl } = require("./permissions");

const NO_ORIGINS = new Set();

function originOf(url) {
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Build the "trusted page" predicate shared by the IPC sender check and the
 * navigation guard: the static rule of `isTrustedUrl` (Teams, the Microsoft
 * sign-in hosts, the app's own local pages), plus the origins of the URLs the
 * user configured (`config.url` and the https profile URLs).
 *
 * The static rule is tried first, so the common case (a Teams or Microsoft
 * sign-in page) never calls `getConfiguredUrls`, which may read the profile
 * store. It is a function, not a value, because the IPC check is installed
 * before the profiles manager exists and profiles change at runtime.
 *
 * @param {() => string[]} getConfiguredUrls
 * @returns {(url: string) => boolean}
 */
function createTrustedPageCheck(getConfiguredUrls) {
  return (url) => {
    if (isTrustedUrl(url, NO_ORIGINS)) return true;
    const origins = new Set(getConfiguredUrls().map(originOf).filter(Boolean));
    return origins.size > 0 && isTrustedUrl(url, origins);
  };
}

module.exports = { createTrustedPageCheck };

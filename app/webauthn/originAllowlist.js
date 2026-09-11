// app/webauthn/originAllowlist.js

/**
 * The origins a WebAuthn ceremony may be served for.
 *
 * Shared by the main-process IPC gate (app/webauthn/index.js) and the preload's
 * subframe postMessage relay (app/browser/tools/webauthnOverride.js). Both have
 * to agree: a ceremony started in a login iframe passes through the relay
 * before it reaches the IPC gate, so a single hardcoded list left behind in
 * either place blocks a configured origin anyway (#2931).
 *
 * Matching is exact. A security decision never depends on pattern matching, so
 * a subdomain of a configured origin has to be configured in its own right.
 */

const DEFAULT_ORIGINS = [
  "https://login.microsoftonline.com",
  "https://login.microsoft.com",
  "https://login.live.com",
];

/**
 * Reduce a configured entry to an exact https origin, or null if it cannot be
 * one: no wildcards, no paths, no credentials, no plaintext http.
 * @param {unknown} entry
 * @returns {string|null}
 */
function normalizeOrigin(entry) {
  if (typeof entry !== "string") return null;
  const trimmed = entry.trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  if (url.hostname.includes("*")) return null;
  return url.origin;
}

/**
 * Build the allowlist from the built-in Microsoft origins plus any configured
 * extras. Malformed entries are dropped with a warning that reports how many
 * were dropped and never the values, since a corporate IdP host identifies the
 * tenant.
 * @param {unknown} extraOrigins - auth.webauthn.extraOrigins
 * @returns {Set<string>}
 */
function buildAllowedOrigins(extraOrigins) {
  const origins = new Set(DEFAULT_ORIGINS);
  if (!Array.isArray(extraOrigins)) return origins;

  let rejected = 0;
  for (const entry of extraOrigins) {
    const origin = normalizeOrigin(entry);
    if (origin) origins.add(origin);
    else rejected += 1;
  }
  if (rejected > 0) {
    console.warn("[WEBAUTHN] Ignored malformed auth.webauthn.extraOrigins entries", {
      rejected,
      expected: "exact https origin, e.g. https://sso.example.com",
    });
  }
  return origins;
}

module.exports = { DEFAULT_ORIGINS, buildAllowedOrigins };

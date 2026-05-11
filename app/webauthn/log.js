// app/webauthn/log.js

/**
 * Structured logging helpers for the WebAuthn / FIDO2 module.
 *
 * Rules:
 * - Everything prefixed [WEBAUTHN] or [WEBAUTHN:PIN] so a single grep shows the whole flow.
 * - Never log raw origins. Use classifyOrigin() for a bucketed label.
 * - Never log credential IDs, challenges, user handles, user names, PINs,
 *   or any other credential material.
 * - Gate verbose / diagnostic lines on the debug sub-flag (setDebug).
 * - Classify errors into coarse buckets before logging.
 *
 * electron-log intercepts console.* calls in main. ADR 013 sanitisation
 * still applies to any residual strings that slip through.
 */

let debugEnabled = false;

/**
 * Enable or disable verbose logging. Wired from config.auth.webauthn.debug
 * during initialize().
 * @param {boolean} flag
 */
function setDebug(flag) {
  debugEnabled = !!flag;
}

function info(...args) {
  console.info(...args);
}

function warn(...args) {
  console.warn(...args);
}

function error(...args) {
  console.error(...args);
}

function debug(...args) {
  if (debugEnabled) console.debug(...args);
}

const ORIGIN_BUCKETS = new Map([
  ["https://login.microsoftonline.com", "login.microsoftonline.com"],
  ["https://login.microsoft.com", "login.microsoft.com"],
  ["https://login.live.com", "login.live.com"],
]);

/**
 * Reduce an origin URL to a safe bucket label. Unknown origins become "other"
 * so we never leak unexpected origins to logs.
 * @param {string} origin
 * @returns {string}
 */
function classifyOrigin(origin) {
  if (typeof origin !== "string") return "other";
  return ORIGIN_BUCKETS.get(origin) || "other";
}

/**
 * Classify an error (string or Error) into a coarse bucket for logging.
 * @param {Error|string|undefined|null} errOrMsg
 * @returns {string}
 */
function classifyError(errOrMsg) {
  const msg = (errOrMsg?.message ?? errOrMsg ?? "").toString().toLowerCase();
  if (msg.includes("no_credentials") || msg.includes("no fido2")) return "NO_CREDENTIALS";
  if (msg.includes("pin") && (msg.includes("invalid") || msg.includes("bad") || msg.includes("wrong"))) return "BAD_PIN";
  if (msg.includes("timed out") || msg.includes("timeout")) return "TIMEOUT";
  if (msg.includes("cancel")) return "CANCELLED";
  if (msg.includes("notallowederror")) return "NOT_ALLOWED";
  if (msg.includes("securityerror")) return "SECURITY";
  if (msg.includes("invalid")) return "INVALID";
  return "OTHER";
}

module.exports = { setDebug, info, warn, error, debug, classifyOrigin, classifyError };

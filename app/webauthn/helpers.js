/**
 * WebAuthn helper utilities for base64url encoding and clientDataJSON generation.
 *
 * Adapted from electron-webauthn-linux (Apache 2.0, Copyright nicholascross).
 * Used under GPLv3 per Apache 2.0 compatibility.
 */

/**
 * Encode a Buffer to base64url string (no padding).
 * @param {Buffer} buffer
 * @returns {string}
 */
function base64urlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url string to Buffer.
 * @param {string} str
 * @returns {Buffer}
 */
function base64urlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

/**
 * Generate the clientDataJSON buffer per the WebAuthn spec.
 * Key order matters: type, challenge, origin, crossOrigin.
 *
 * @param {string} type - "webauthn.create" or "webauthn.get"
 * @param {Buffer} challengeBytes - Raw challenge bytes
 * @param {string} origin - Origin string (e.g. "https://login.microsoftonline.com")
 * @returns {Buffer}
 */
function generateClientDataJSON(type, challengeBytes, origin) {
  const clientData = JSON.stringify({
    type,
    challenge: base64urlEncode(challengeBytes),
    origin,
    crossOrigin: false,
  });
  return Buffer.from(clientData, "utf-8");
}

/**
 * Sanitize a string for use in fido2-tools line-based stdin protocol.
 * Removes control characters (including newlines) that would corrupt
 * the protocol, and limits length to prevent abuse.
 *
 * @param {string} value
 * @param {number} [maxLength=500]
 * @returns {string}
 */
function sanitizeForFido2(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, "").substring(0, maxLength);
}

module.exports = { base64urlEncode, base64urlDecode, generateClientDataJSON, sanitizeForFido2 };

// app/webauthn/helpers.js

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
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    // Bounded: base64 padding is never more than two "=" (S8786).
    .replace(/={1,2}$/, "");
}

/**
 * Decode a base64url string to Buffer.
 * @param {string} str
 * @returns {Buffer}
 */
function base64urlDecode(str) {
  let base64 = str.replaceAll("-", "+").replaceAll("_", "/");
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
 * @param {string} origin - Origin of the frame that called navigator.credentials
 * @param {string|null} [topOrigin] - Origin of the top-level document, when the
 *   ceremony ran in a frame. Only differs from `origin` for an iframe ceremony,
 *   which is what makes it cross-origin.
 * @returns {Buffer}
 */
function generateClientDataJSON(type, challengeBytes, origin, topOrigin = null) {
  const crossOrigin = Boolean(topOrigin) && topOrigin !== origin;
  const clientData = JSON.stringify({
    type,
    challenge: base64urlEncode(challengeBytes),
    origin,
    crossOrigin,
    // topOrigin is defined only for a cross-origin ceremony (WebAuthn L3).
    ...(crossOrigin ? { topOrigin } : {}),
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
  return value.replaceAll(/[\x00-\x1f\x7f]/g, "").substring(0, maxLength);
}

module.exports = { base64urlEncode, base64urlDecode, generateClientDataJSON, sanitizeForFido2 };

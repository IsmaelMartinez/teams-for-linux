// Schemes the app hands to the operating system on behalf of a page: web
// links, mail and phone links, and the Teams and SIP links Teams itself opens
// (both Teams schemes the app registers, see mainAppWindow/protocolLink.js).
// Anything else (file shares, search or installer handlers, other apps'
// custom schemes) is refused, because the OS runs whatever is registered for
// a scheme without asking.
const EXTERNAL_SCHEMES = new Set([
  "https:",
  "http:",
  "mailto:",
  "tel:",
  "sip:",
  "msteams:",
  "web+msteams:",
]);

/**
 * @param {string} url
 * @returns {string|null} the scheme with its trailing colon, or null when the URL does not parse
 */
function schemeOf(url) {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

/**
 * Whether a page-supplied URL may be opened outside the app.
 * @param {string} url
 * @returns {boolean}
 */
function isSafeExternalUrl(url) {
  return EXTERNAL_SCHEMES.has(schemeOf(url));
}

module.exports = { isSafeExternalUrl, schemeOf };

/**
 * Normalisation of Teams protocol links received as launch arguments.
 *
 * Teams' launcher page hands a meeting to the desktop app through a custom
 * scheme. Depending on a server-side flag (`enableWebMsteamsProtocol`) it uses
 * `msteams:` or `web+msteams:`. Both carry the same path, so the `web+` prefix
 * is dropped here and the rest of the link handling only deals with `msteams:`.
 *
 * Never log the link: it carries the recipient or the meeting.
 */

// Schemes the app asks the OS to route to it. Keep in step with
// `build.protocols.schemes` in package.json.
const PROTOCOL_SCHEMES = ["msteams", "web+msteams"];

const WEB_PREFIX = /^web\+(?=msteams:)/i;

/**
 * Rewrites a `web+msteams:` launch argument to its `msteams:` equivalent.
 * Any other argument is returned untouched.
 *
 * @param {string} arg - Command line argument
 * @returns {string} Argument with a leading `web+` removed from an msteams link
 */
function stripWebPrefix(arg) {
  return typeof arg === "string" ? arg.replace(WEB_PREFIX, "") : arg;
}

module.exports = { PROTOCOL_SCHEMES, stripWebPrefix };

/**
 * Teams protocol links received as launch arguments.
 *
 * Teams' launcher page hands a meeting to the desktop app through a custom
 * scheme. Depending on a server-side flag (`enableWebMsteamsProtocol`) it uses
 * `msteams:` or `web+msteams:`. Both carry the same path, so the `web+` prefix
 * is dropped before matching and the rest of the link handling only deals with
 * `msteams:`.
 *
 * This module has no Electron imports so unit tests can load it directly.
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

/**
 * Extracts the Teams URL to open from command line arguments.
 * Handles msteams: and web+msteams: protocol links and HTTPS URLs that match
 * the Teams domain pattern. This enables deep linking into Teams conversations,
 * meetings, and channels.
 *
 * @param {string[]} args - Command line arguments to process
 * @param {{msTeamsProtocols: {v1: string, v2: string}, meetupJoinRegEx: string, url: string}} config
 * @returns {string|null} URL to navigate to, or null if no argument is a Teams link
 */
function resolveLaunchUrl(args, config) {
  // Legacy Teams protocol format: msteams:/l/meetup-join/...
  const v1msTeams = new RegExp(config.msTeamsProtocols.v1);
  // Modern Teams protocol format: msteams://teams.microsoft.com/l/...
  const v2msTeams = new RegExp(config.msTeamsProtocols.v2);
  const meetupJoin = new RegExp(config.meetupJoinRegEx);
  for (const rawArg of args) {
    // The launcher may use `web+msteams:` in place of `msteams:`.
    const arg = stripWebPrefix(rawArg);
    console.debug(`testing RegExp processArgs ${meetupJoin.test(arg)}`);
    if (meetupJoin.test(arg)) {
      console.debug("A url argument received with https protocol");
      return arg;
    }
    if (v1msTeams.test(arg)) {
      console.debug("A url argument received with msteams v1 protocol");
      return config.url + arg.substring(8, arg.length);
    }
    if (v2msTeams.test(arg)) {
      console.debug("A url argument received with msteams v2 protocol");
      return arg.replace("msteams", "https");
    }
  }
  return null;
}

module.exports = { PROTOCOL_SCHEMES, stripWebPrefix, resolveLaunchUrl };

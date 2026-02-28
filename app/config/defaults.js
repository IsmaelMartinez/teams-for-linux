/**
 * Default configuration values that need to be shared across modules.
 * This file exists to allow unit tests to import default values without
 * initializing the full config system.
 */

// Network error patterns that indicate transient connection issues (proxy, tunnel, DNS, etc.)
// Used by both the global error handlers (app/index.js) and ConnectionManager.
const NETWORK_ERROR_PATTERNS = [
  'ERR_TUNNEL_CONNECTION_FAILED',
  'ERR_PROXY_CONNECTION_FAILED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK_CHANGED',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_NAME_NOT_RESOLVED',
];

const defaults = {
  meetupJoinRegEx: String.raw`^https://teams\.(?:microsoft\.com|live\.com|cloud\.microsoft)/(v2/\?meetingjoin=|meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)`,
  NETWORK_ERROR_PATTERNS,
};

module.exports = defaults;

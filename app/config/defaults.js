/**
 * Default configuration values that need to be shared across modules.
 * This file exists to allow unit tests to import default values without
 * initializing the full config system.
 */

const defaults = {
  meetupJoinRegEx: String.raw`^https://teams\.(?:microsoft\.com|live\.com|cloud\.microsoft)/(meet|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team))/`,
};

module.exports = defaults;

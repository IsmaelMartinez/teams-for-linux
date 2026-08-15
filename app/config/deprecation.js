// Builds the startup warning for deprecated config options. Pure data module,
// no Electron imports, mirroring app/config/validator.js.
//
// One aggregated message, never one per option: showConfigurationDialogs in
// app/index.js opens a blocking modal for every entry in config.warnings, so
// a config using several deprecated options would stack modals at startup.
// This matters as ADR-025 renames land, since each rename deprecates a key.
//
// PII safety (see CLAUDE.md): the message contains option NAMES and the
// author-written deprecation text only, never config values.
//
// Known limitation: only the config file is inspected. A deprecated option
// passed as a CLI flag or environment variable (yargs runs with .env(true))
// produces no warning, so those users would be silently ignored once a
// renamed option stops being read. Widening this needs the parsed argv and
// the env prefix, not just the config file.

/**
 * @param {Record<string, string|boolean>} deprecatedOptions yargs
 *   getDeprecatedOptions() output: option name to message, or `true` when the
 *   option declared `deprecated: true` with no text.
 * @param {Record<string, unknown>} configFile the merged config file contents.
 * @returns {string|null} a single warning, or null when nothing is deprecated.
 */
function buildDeprecationWarning(deprecatedOptions, configFile) {
  // Object.hasOwn, matching validator.js, so an inherited key (a config file
  // literally naming "__proto__" or "constructor") cannot trigger a warning.
  const used = Object.keys(deprecatedOptions || {}).filter(
    (option) => configFile && Object.hasOwn(configFile, option)
  );

  if (used.length === 0) return null;

  const lines = used.map((option) => {
    const detail = deprecatedOptions[option];
    return typeof detail === "string" && detail.length > 0
      ? `  - ${option}: ${detail}`
      : `  - ${option}`;
  });

  const subject =
    used.length === 1
      ? "1 configuration option is"
      : `${used.length} configuration options are`;

  return `${subject} deprecated and will be removed in a future release:\n${lines.join("\n")}`;
}

module.exports = { buildDeprecationWarning };

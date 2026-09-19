// Builds the startup warning for deprecated config options. Pure data module,
// no Electron imports, mirroring app/config/validator.js.
//
// One aggregated message, never one per option: ADR-025 deprecates a key per
// rename, so a config using several would otherwise emit a wall of
// near-identical lines. app/config/index.js only logs this and deliberately
// keeps it out of the startup modal; the reasoning lives there.
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
 * @param {boolean} [menuAvailable] whether the Settings entry that offers the
 *   migration can actually be reached; see isMigrationMenuAvailable. Pointing
 *   users at a menu they do not have would be worse than saying nothing.
 * @returns {string|null} a single warning, or null when nothing is deprecated.
 */
function buildDeprecationWarning(deprecatedOptions, configFile, menuAvailable) {
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

  const pointer = menuAvailable
    ? "\n\nSettings > Show Updated Config… writes a copy of your config using the new names. Your own config.json is left alone."
    : "";

  return `${subject} deprecated and will be removed in a future release:\n${lines.join("\n")}${pointer}`;
}

/**
 * Whether "Settings > Show Updated Config…" can be reached at all, which is
 * what decides whether the warning points at it.
 *
 * Two surfaces carry the same App submenu, so either is enough: the menu bar,
 * attached unless `menubar` is "hidden" (`initialize` in app/menus/index.js),
 * and the tray context menu, built from that submenu when the tray is on.
 * Gating on the tray alone hid the pointer from anyone who turned the tray off
 * but kept their menu bar.
 *
 * @param {Record<string, unknown>} config the resolved config.
 * @returns {boolean}
 */
function isMigrationMenuAvailable(config) {
  if (!config) return false;
  return config.menubar !== "hidden" || Boolean(config.trayIconEnabled);
}

module.exports = { buildDeprecationWarning, isMigrationMenuAvailable };

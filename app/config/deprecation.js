// Builds the startup warning for deprecated config options. Pure data module,
// no Electron imports, mirroring app/config/validator.js.
//
// One aggregated message, never one per option: ADR-025 deprecates a key per
// rename, so a config using several would otherwise emit a wall of
// near-identical lines. app/config/index.js logs it and hands it to the
// acknowledge-once Configuration Warning modal, which keys "Don't show this
// again" on a hash of the text. So the text must be stable from one launch to
// the next: option names sorted with a fixed locale, no values, no timestamps.
// It changes only when the set of deprecated names the user sets, or where they
// set them, changes, and then prompting again is right.
//
// PII safety (see CLAUDE.md): the message contains option NAMES and the
// author-written deprecation text only, never config values.
//
// Every source yargs reads is inspected: the config file, command-line flags
// and environment variables (yargs runs with .env(true)), so a user who only
// ever passes `--webDebug` is warned before the flat names are removed.

// When the flat names stop being read (#2842).
const REMOVAL_VERSION = "2.32.0";

// Display order and wording, independent of the precedence order the
// projection uses, so the message reads file first.
const SOURCE_LABELS = [
  ["file", "config file"],
  ["cli", "command line"],
  ["env", "environment variable"],
];

function suppliedIn(source, option) {
  // Object.hasOwn, matching validator.js, so an inherited key (a config file
  // literally naming "__proto__" or "constructor") cannot trigger a warning.
  return Boolean(source) && typeof source === "object" && Object.hasOwn(source, option);
}

/**
 * @param {Record<string, string|boolean>} deprecatedOptions yargs
 *   getDeprecatedOptions() output: option name to message, or `true` when the
 *   option declared `deprecated: true` with no text.
 * @param {{cli?: object, env?: object, file?: object}} sources what the user
 *   supplied, per source; see readUserSources in app/config/renames.js.
 * @param {boolean} [menuAvailable] whether the Settings entry that offers the
 *   migration can actually be reached; see isMigrationMenuAvailable. Pointing
 *   users at a menu they do not have would be worse than saying nothing.
 * @returns {string|null} a single warning, or null when nothing is deprecated.
 */
function buildDeprecationWarning(deprecatedOptions, sources, menuAvailable) {
  const used = Object.keys(deprecatedOptions || {})
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((option) => ({
      option,
      from: SOURCE_LABELS.filter(([key]) => suppliedIn(sources?.[key], option)),
    }))
    .filter(({ from }) => from.length > 0);

  if (used.length === 0) return null;

  const lines = used.map(({ option, from }) => {
    const where = from.map(([, label]) => label).join(", ");
    const detail = deprecatedOptions[option];
    return typeof detail === "string" && detail.length > 0
      ? `  - ${option} (${where}): ${detail}`
      : `  - ${option} (${where})`;
  });

  const subject =
    used.length === 1
      ? "1 configuration option is deprecated and stops"
      : `${used.length} configuration options are deprecated and stop`;

  const inFile = used.some(({ from }) => from.some(([key]) => key === "file"));
  const outsideFile = used.some(({ from }) =>
    from.some(([key]) => key !== "file")
  );

  const notes = [];
  if (inFile && menuAvailable) {
    notes.push(
      "Settings > Show Updated Config… writes a copy of your config using the new names. Your own config.json is left alone."
    );
  }
  if (outsideFile) {
    notes.push(
      "Command-line flags and environment variables are not migrated for you: use the new names there too, with dots on the command line (--window.frame) and double underscores in the environment (WINDOW__FRAME)."
    );
  }

  const tail = notes.length > 0 ? `\n\n${notes.join("\n\n")}` : "";
  return `${subject} working in ${REMOVAL_VERSION}:\n${lines.join("\n")}${tail}`;
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

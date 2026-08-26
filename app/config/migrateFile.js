// Writes a copy of the user's config.json using the ADR-025 nested names, for
// the Settings entry that offers it. Never touches config.json itself: the
// user reviews the copy and moves it over when they are ready, so a bad
// migration cannot break a working install.
const fs = require("node:fs");
const path = require("node:path");
const { RENAMES, toNestedConfigFile } = require("./renames");
const { validateConfigFile } = require("./validator");
const options = require("./options");

const MIGRATED_FILE = "config.migrated.json";

/**
 * Reads the USER config file only, deliberately, not the system-and-user merge
 * that app/config/index.js assembles: migrating that and writing it back here
 * would copy /etc values into the user's own file, turning per-key admin
 * policy into a whole-namespace user override.
 */
function readUserConfig(configPath) {
  const file = path.join(configPath, "config.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Rewrites the user's config onto the nested names and writes it alongside the
 * original.
 *
 * @param {string} configPath the directory holding config.json.
 * @returns {{status: string, file?: string, dir?: string, renamed?: string[],
 *   skipped?: string[], warnings?: string[], error?: string}} `status` is one
 *   of `no-config`, `nothing-to-migrate`, `blocked`, `invalid-json`,
 *   `write-failed` or `written`.
 *
 *   Only option NAMES are ever returned, never configured values, so the whole
 *   result is safe to put on screen and in the log. `error` carries a
 *   filesystem message on `write-failed` and is absent otherwise; a JSON parse
 *   error is deliberately not passed through, because V8 embeds a slice of the
 *   source text in it and that slice is the user's config.
 */
function writeMigratedConfig(configPath) {
  let userConfig;
  try {
    userConfig = readUserConfig(configPath);
  } catch {
    return { status: "invalid-json" };
  }
  if (!userConfig) return { status: "no-config" };

  const present = RENAMES.map(({ flat }) => flat).filter((flat) =>
    Object.hasOwn(userConfig, flat),
  );
  if (present.length === 0) return { status: "nothing-to-migrate" };

  const migrated = toNestedConfigFile(userConfig);

  // What actually moved, read off the result rather than assumed from the
  // input: toNestedConfigFile leaves a flat key alone when its namespace is
  // occupied by a non-object, and reporting those as migrated would describe a
  // file we did not write.
  const renamed = present.filter((flat) => !Object.hasOwn(migrated, flat));
  const skipped = present.filter((flat) => Object.hasOwn(migrated, flat));

  if (renamed.length === 0) return { status: "blocked", skipped };

  // The transform moves values verbatim, while a flat option gets its declared
  // type coerced by yargs and a nested leaf does not. The validator is what
  // catches the difference, so the caller can show it before anyone adopts the
  // file. See app/config/renames.js.
  const warnings = validateConfigFile(migrated, options);

  const file = path.join(configPath, MIGRATED_FILE);
  try {
    fs.writeFileSync(file, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
  } catch (err) {
    return { status: "write-failed", error: err.message };
  }

  return { status: "written", file, dir: configPath, renamed, skipped, warnings };
}

module.exports = { writeMigratedConfig, MIGRATED_FILE };

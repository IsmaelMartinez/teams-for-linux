// Writes a copy of the user's config.json using the ADR-025 nested names, for
// the Settings entry that offers it. Never touches config.json itself: the
// user reviews the copy and moves it over when they are ready, so a bad
// migration cannot break a working install.
const fs = require("node:fs");
const path = require("node:path");
const { RENAMES, toNestedConfigFile } = require("./renames");
const { validateConfigFile, isPlainObject } = require("./validator");
const options = require("./options");

const MIGRATED_FILE = "config.migrated.json";

// The copy carries everything config.json carries, including MQTT credentials,
// service URLs and certificate paths, so it must not end up more readable than
// the original. Mirror the original's mode, and fall back to owner-only rather
// than to whatever the umask gives.
const FALLBACK_MODE = 0o600;

function modeOf(file) {
  try {
    return fs.statSync(file).mode & 0o777;
  } catch {
    return FALLBACK_MODE;
  }
}

/**
 * Reads the USER config file only, deliberately, not the system-and-user merge
 * that app/config/index.js assembles: migrating that and writing it back here
 * would copy /etc values into the user's own file, turning per-key admin
 * policy into a whole-namespace user override.
 */
function readUserConfig(configPath) {
  return JSON.parse(
    fs.readFileSync(path.join(configPath, "config.json"), "utf8"),
  );
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
  // Absence is checked separately from parsing, so a file holding `null` is
  // reported as unusable rather than as "you have no config yet".
  if (!fs.existsSync(path.join(configPath, "config.json"))) {
    return { status: "no-config" };
  }

  let userConfig;
  try {
    userConfig = readUserConfig(configPath);
  } catch {
    return { status: "invalid-json" };
  }
  // Valid JSON that is not an object (an array, a string, a number, null)
  // would fall through as "nothing to migrate", which reads as reassurance
  // when the file is actually unusable.
  if (!isPlainObject(userConfig)) return { status: "invalid-json" };

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
  const mode = modeOf(path.join(configPath, "config.json"));
  try {
    fs.writeFileSync(file, `${JSON.stringify(migrated, null, 2)}\n`, {
      encoding: "utf8",
      mode,
    });
    // writeFileSync only applies `mode` when it creates the file, so a copy
    // left over from an earlier run would keep its old permissions.
    fs.chmodSync(file, mode);
  } catch (err) {
    return { status: "write-failed", error: err.message };
  }

  return { status: "written", file, dir: configPath, renamed, skipped, warnings };
}

module.exports = { writeMigratedConfig, MIGRATED_FILE };

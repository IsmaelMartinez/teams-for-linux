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
 * @returns {{status: string, file?: string, renamed?: string[], warnings?: string[]}}
 *   `status` is one of `no-config`, `nothing-to-migrate`, `written`, or
 *   `failed`; `renamed` lists the flat names that moved, and `warnings` carries
 *   whatever the validator says about the result. Values are never included,
 *   so this is safe to log.
 */
function writeMigratedConfig(configPath) {
  let userConfig;
  try {
    userConfig = readUserConfig(configPath);
  } catch (err) {
    return { status: "failed", error: err.message };
  }
  if (!userConfig) return { status: "no-config" };

  const renamed = RENAMES.map(({ flat }) => flat).filter((flat) =>
    Object.hasOwn(userConfig, flat),
  );
  if (renamed.length === 0) return { status: "nothing-to-migrate" };

  const migrated = toNestedConfigFile(userConfig);

  // The transform moves values verbatim, while a flat option gets its declared
  // type coerced by yargs and a nested leaf does not. The validator is what
  // catches the difference, so the caller can show it before anyone adopts the
  // file. See app/config/renames.js.
  const warnings = validateConfigFile(migrated, options);

  const file = path.join(configPath, MIGRATED_FILE);
  try {
    fs.writeFileSync(file, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
  } catch (err) {
    return { status: "failed", error: err.message };
  }

  return { status: "written", file, renamed, warnings };
}

module.exports = { writeMigratedConfig, MIGRATED_FILE };

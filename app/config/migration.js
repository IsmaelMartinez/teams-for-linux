/**
 * Configuration migration module
 *
 * Automatically converts old flat configuration keys to new nested structure.
 * This runs transparently for users, ensuring backward compatibility.
 */

/**
 * Check if config has any old Intune keys that need migration
 * @param {Object} config - The config object
 * @returns {boolean} - True if migration needed
 */
function hasOldIntuneKeys(config) {
  return "ssoInTuneEnabled" in config || "ssoInTuneAuthUser" in config;
}

/**
 * Migrate old Intune keys to new nested structure
 * @param {Object} config - The config object to migrate
 */
function migrateIntune(config) {
  // Initialize auth object if it doesn't exist or is using defaults
  if (!config.auth || typeof config.auth !== "object") {
    config.auth = {
      intune: { enabled: false, user: "" },
    };
  }

  // Ensure intune nested object exists
  if (!config.auth.intune) config.auth.intune = { enabled: false, user: "" };

  // Migrate individual keys (only if old key is explicitly set)
  if ("ssoInTuneEnabled" in config) {
    config.auth.intune.enabled = config.ssoInTuneEnabled;
  }

  if ("ssoInTuneAuthUser" in config && config.ssoInTuneAuthUser !== "") {
    config.auth.intune.user = config.ssoInTuneAuthUser;
  }
}

/**
 * Migrate old configuration keys to new nested structure
 * @param {Object} config - Parsed config object
 * @returns {Object} - Migrated config
 */
function migrateConfig(config) {
  const migrations = [];

  if (hasOldIntuneKeys(config)) {
    migrateIntune(config);
    migrations.push("auth.intune");
  }

  if (migrations.length > 0) {
    console.info(`[Config Migration] Auto-migrated: ${migrations.join(", ")}`);
    console.info("[Config Migration] Old config keys still work, but consider updating to new format");
    console.info("[Config Migration] See: https://ismaelmartinez.github.io/teams-for-linux/configuration");
  }

  return config;
}

module.exports = { migrateConfig, hasOldIntuneKeys, migrateIntune };

/**
 * Configuration migration module
 *
 * Automatically converts old flat configuration keys to new nested structure.
 * This runs transparently for users, ensuring backward compatibility.
 */

/**
 * Check if config has any old auth keys that need migration
 * @param {Object} config - The config object
 * @returns {boolean} - True if migration needed
 */
function hasOldAuthKeys(config) {
  return "authServerWhitelist" in config ||
    "ssoBasicAuthUser" in config ||
    "ssoBasicAuthPasswordCommand" in config ||
    "ssoInTuneEnabled" in config ||
    "ssoInTuneAuthUser" in config ||
    "clientCertPath" in config ||
    "clientCertPassword" in config ||
    "customCACertsFingerprints" in config;
}

/**
 * Migrate old auth keys to new nested structure
 * @param {Object} config - The config object to migrate
 */
function migrateAuth(config) {
  // Initialize auth object if it doesn't exist or is using defaults
  if (!config.auth || typeof config.auth !== "object") {
    config.auth = {
      serverWhitelist: "*",
      basic: { user: "", passwordCommand: "" },
      intune: { enabled: false, user: "" },
      certificate: { path: "", password: "" },
      customCACertsFingerprints: [],
    };
  }

  // Ensure nested objects exist
  if (!config.auth.basic) config.auth.basic = { user: "", passwordCommand: "" };
  if (!config.auth.intune) config.auth.intune = { enabled: false, user: "" };
  if (!config.auth.certificate) config.auth.certificate = { path: "", password: "" };

  // Migrate individual keys (only if old key is explicitly set)
  if ("authServerWhitelist" in config && config.authServerWhitelist !== "*") {
    config.auth.serverWhitelist = config.authServerWhitelist;
  }

  if ("ssoBasicAuthUser" in config && config.ssoBasicAuthUser !== "") {
    config.auth.basic.user = config.ssoBasicAuthUser;
  }

  if ("ssoBasicAuthPasswordCommand" in config && config.ssoBasicAuthPasswordCommand !== "") {
    config.auth.basic.passwordCommand = config.ssoBasicAuthPasswordCommand;
  }

  if ("ssoInTuneEnabled" in config) {
    config.auth.intune.enabled = config.ssoInTuneEnabled;
  }

  if ("ssoInTuneAuthUser" in config && config.ssoInTuneAuthUser !== "") {
    config.auth.intune.user = config.ssoInTuneAuthUser;
  }

  if ("clientCertPath" in config && config.clientCertPath !== "") {
    config.auth.certificate.path = config.clientCertPath;
  }

  if ("clientCertPassword" in config && config.clientCertPassword !== "") {
    config.auth.certificate.password = config.clientCertPassword;
  }

  if ("customCACertsFingerprints" in config && Array.isArray(config.customCACertsFingerprints) && config.customCACertsFingerprints.length > 0) {
    config.auth.customCACertsFingerprints = config.customCACertsFingerprints;
  }
}

/**
 * Migrate old configuration keys to new nested structure
 * @param {Object} config - Parsed config object
 * @returns {Object} - Migrated config
 */
function migrateConfig(config) {
  const migrations = [];

  if (hasOldAuthKeys(config)) {
    migrateAuth(config);
    migrations.push("auth");
  }

  if (migrations.length > 0) {
    console.info(`[Config Migration] Auto-migrated: ${migrations.join(", ")}`);
    console.info("[Config Migration] Old config keys still work, but consider updating to new format");
    console.info("[Config Migration] See: https://ismaelmartinez.github.io/teams-for-linux/configuration");
  }

  return config;
}

module.exports = { migrateConfig, hasOldAuthKeys, migrateAuth };

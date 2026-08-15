const yargs = require("yargs");
const fs = require("node:fs");
const path = require("node:path");
const { ipcMain } = require("electron");
const logger = require("./logger");
const configOptions = require("./options");
const { validateConfigFile } = require("./validator");
const { buildDeprecationWarning } = require("./deprecation");
const { applyRenamedOptions } = require("./renames");

function getConfigFilePath(configPath) {
  return path.join(configPath, "config.json");
}

function getSystemConfigFilePath() {
  return "/etc/teams-for-linux/config.json";
}

function checkConfigFileExistence(configPath) {
  return fs.existsSync(getConfigFilePath(configPath));
}

function checkSystemConfigFileExistence() {
  return fs.existsSync(getSystemConfigFilePath());
}

function getConfigFile(configPath) {
  return require(getConfigFilePath(configPath));
}

function getSystemConfigFile() {
  return require(getSystemConfigFilePath());
}

function populateConfigObjectFromFile(configObject, configPath) {
  let systemConfig = {};
  let userConfig = {};
  let hasUserConfig = false;
  let hasSystemConfig = false;

  // First, try to load system-wide config
  if (checkSystemConfigFileExistence()) {
    try {
      systemConfig = getSystemConfigFile();
      hasSystemConfig = true;
      console.info(
        "System-wide config loaded from /etc/teams-for-linux/config.json"
      );
    } catch (e) {
      console.warn(
        "Error loading system-wide config file, ignoring:\n" + e.message
      );
    }
  }

  // Then, try to load user config (this takes precedence)
  if (checkConfigFileExistence(configPath)) {
    try {
      userConfig = getConfigFile(configPath);
      hasUserConfig = true;
    } catch (e) {
      configObject.configError = e.message;
      console.warn(
        "Error in user config file, using system config or defaults:\n" +
          configObject.configError
      );
    }
  }

  // Merge configs with user config taking precedence over system config
  if (hasUserConfig || hasSystemConfig) {
    configObject.configFile = { ...systemConfig, ...userConfig };
    configObject.isConfigFile = true;

    if (hasUserConfig && hasSystemConfig) {
      console.info(
        "Using merged configuration: system-wide config overridden by user config"
      );
    } else if (hasUserConfig) {
      console.info("Using user configuration");
    } else {
      console.info("Using system-wide configuration (no user config found)");
    }
  } else {
    console.warn(
      "No config file found (user or system-wide), using default values"
    );
  }
}

function extractYargConfig(configObject, appVersion) {
  // yargs v18 requires explicit instantiation - it's no longer a singleton
  const yargsInstance = yargs();
  const parsedConfig = yargsInstance
    .env(true)
    .config(configObject.configFile)
    .version(appVersion)
    .options(configOptions)
    .help()
    .parse(process.argv.slice(1));

  return { yargsInstance, parsedConfig };
}

function checkUsedDeprecatedValues(yargsInstance, configObject, config) {
  // yargs v18: getDeprecatedOptions() must be called on the instance
  const message = buildDeprecationWarning(
    yargsInstance.getDeprecatedOptions(),
    configObject.configFile
  );
  if (!message) return;

  console.warn(message);
  // Single entry on purpose; see app/config/deprecation.js for why.
  // `warnings` is not a declared option, so a config file containing that key
  // lands here verbatim; only extend it when it is already a list.
  const existing = Array.isArray(config["warnings"]) ? config["warnings"] : [];
  config["warnings"] = [...existing, message];
}

function argv(configPath, appVersion) {
  const configObject = {
    configFile: {},
    configError: null,
    configWarning: null,
    isConfigFile: false,
  };

  populateConfigObjectFromFile(configObject, configPath);

  // yargs v18: extractYargConfig now returns both the instance and parsed config
  const { yargsInstance, parsedConfig: config } = extractYargConfig(configObject, appVersion);

  if (configObject.configError) {
    config["error"] = configObject.configError;
  }

  // ADR-025: project any nested value the user supplied onto the flat key that
  // modules still read. Must run before anything consumes the config. The raw
  // config file is the presence oracle; see app/config/renames.js for why.
  applyRenamedOptions(config, configObject.configFile);

  if (configObject.isConfigFile && config.watchConfigFile) {
    fs.watch(getConfigFilePath(configPath), (event, filename) => {
      console.info(
        `Config file ${filename} changed ${event}. Relaunching app...`
      );
      ipcMain.emit("config-file-changed");
    });
  }

  // Track whether disableGpu was explicitly set via CLI or config file
  // This allows Wayland detection to use smart defaults while respecting user preferences
  const wasSetInCli = process.argv.some(arg => arg.startsWith('--disableGpu'));
  const wasSetInFile = configObject.configFile && "disableGpu" in configObject.configFile;
  config.disableGpuExplicitlySet = wasSetInCli || wasSetInFile;

  logger.init(config.logConfig);

  // Runs after logger.init so the warning reaches the log file and not just
  // stdout; users attaching a log to a bug report need to see it.
  // Pass yargs instance to access getDeprecatedOptions() in v18
  checkUsedDeprecatedValues(yargsInstance, configObject, config);

  // Warn-only schema validation of the merged (system + user) config file
  // contents (issue #2597). Runs after logger.init so warnings reach the log.
  // Warnings contain key names and type names only — never config values.
  if (configObject.isConfigFile) {
    const validationWarnings = validateConfigFile(
      configObject.configFile,
      configOptions
    );
    for (const warning of validationWarnings) {
      console.warn(`[CONFIG] ${warning}`);
    }
  }

  console.info("configPath:", configPath);
  console.debug("configFile:", configObject.configFile);

  return config;
}

exports = module.exports = argv;

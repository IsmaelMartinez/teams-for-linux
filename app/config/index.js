const yargs = require("yargs");
const fs = require("node:fs");
const path = require("node:path");
const { ipcMain } = require("electron");
const logger = require("./logger");
const configOptions = require("./options");

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
  // JSON.parse, not require(): config files must not enter the module system.
  return JSON.parse(fs.readFileSync(getConfigFilePath(configPath), "utf8"));
}

function getSystemConfigFile() {
  return JSON.parse(fs.readFileSync(getSystemConfigFilePath(), "utf8"));
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
  const deprecatedOptions = yargsInstance.getDeprecatedOptions();
  const warnings = [];

  for (const option in deprecatedOptions) {
    if (option in configObject.configFile) {
      const deprecatedWarningMessage = `Option \`${option}\` is deprecated and will be removed in future version. \n ${deprecatedOptions[option]}.`;
      console.warn(deprecatedWarningMessage);
      warnings.push(deprecatedWarningMessage);
    } else {
      console.debug(`all good with ${option} you aren't using them`);
    }
  }

  // Accumulate all warnings instead of overwriting
  if (warnings.length > 0) {
    config["warnings"] = warnings;
  }
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

  // Pass yargs instance to access getDeprecatedOptions() in v18
  checkUsedDeprecatedValues(yargsInstance, configObject, config);

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

  console.info("configPath:", configPath);
  // Keys only: config values can include MQTT/SSO credentials and service URLs.
  console.debug("configFile keys:", Object.keys(configObject.configFile));

  return config;
}

exports = module.exports = argv;

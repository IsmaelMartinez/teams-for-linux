const yargs = require("yargs");
const fs = require("node:fs");
const path = require("node:path");
const { ipcMain } = require("electron");
const logger = require("./logger");

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
  return yargs
    .env(true)
    .config(configObject.configFile)
    .version(appVersion)
    .options({
      appActiveCheckInterval: {
        default: 2,
        describe:
          "A numeric value in seconds as poll interval to check if the system is active from being idle",
        type: "number",
      },
      screenSharingThumbnail: {
        default: {
          enabled: true,
          alwaysOnTop: true,
        },
        describe:
          "Automatically show a thumbnail window when screen sharing is active, with alwaysOnTop to keep the preview window above other windows.",
        type: "object",
      },
      appIcon: {
        default: "",
        describe: "Teams app icon to show in the tray",
        type: "string",
      },
      appIconType: {
        default: "default",
        describe: "Type of tray icon to be used",
        type: "string",
        choices: ["default", "light", "dark"],
      },
      appIdleTimeout: {
        default: 300,
        describe:
          "A numeric value in seconds as duration before app considers the system as idle",
        type: "number",
      },
      appIdleTimeoutCheckInterval: {
        default: 10,
        describe:
          "A numeric value in seconds as poll interval to check if the appIdleTimeout is reached",
        type: "number",
      },
      appTitle: {
        default: "Microsoft Teams",
        describe: "A text to be suffixed with page title",
        type: "string",
      },
      alwaysOnTop: {
        default: true,
        describe: "Keep the pop-out window always on top of other windows.",
        type: "boolean",
      },
      authServerWhitelist: {
        default: "*",
        describe: "Set auth-server-whitelist value",
        type: "string",
      },
      awayOnSystemIdle: {
        default: false,
        describe: "Sets the user status as away when system goes idle",
        type: "boolean",
      },
      chromeUserAgent: {
        default: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`,
        describe: "Google Chrome User Agent",
        type: "string",
      },
      customBGServiceBaseUrl: {
        default: "http://localhost",
        describe:
          "Base URL of the server which provides custom background images",
        type: "string",
      },
      customBGServiceConfigFetchInterval: {
        default: 0,
        describe:
          "A numeric value in seconds as poll interval to download background service config download",
        type: "number",
      },
      customCACertsFingerprints: {
        default: [],
        describe:
          "Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate",
        type: "array",
      },
      customCSSName: {
        default: "",
        describe:
          'custom CSS name for the packaged available css files. Currently those are: "compactDark", "compactLight", "tweaks", "condensedDark" and "condensedLight" ',
        type: "string",
      },
      customCSSLocation: {
        default: "",
        describe: "custom CSS styles file location",
        type: "string",
      },
      contextIsolation: {
        default: true,
        deprecated:
          "Enabled by default and not configurable anymore. Please remove it from your configuration",
        describe:
          "Use contextIsolation on the main BrowserWindow (WIP - Disabling this will break most functionality)",
        type: "boolean",
      },
      disableTimestampOnCopy: {
        default: false,
        describe:
          "Controls whether timestamps are included when copying messages in chats",
        type: "boolean",
      },
      class: {
        default: null,
        describe: "A custom value for the WM_CLASS property",
        type: "string",
      },
      cacheManagement: {
        default: {
          enabled: true,
          maxCacheSizeMB: 600,
          cacheCheckIntervalMs: 3600000,
        },
        describe:
          "Cache management configuration to prevent daily logout issues",
        type: "object",
      },
      clearStorageData: {
        default: null,
        describe:
          "Flag to clear storage data. Expects an object of the type https://www.electronjs.org/docs/latest/api/session#sesclearstoragedataoptions",
        type: "boolean",
      },
      clientCertPath: {
        default: "",
        describe:
          "Custom Client Certs for corporate authentication (certificate must be in pkcs12 format)",
        type: "string",
      },
      clientCertPassword: {
        default: "",
        describe:
          "Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format)",
        type: "string",
      },
      closeAppOnCross: {
        default: false,
        describe: "Close the app when clicking the close (X) cross",
        type: "boolean",
      },
      defaultNotificationUrgency: {
        default: "normal",
        describe: "Default urgency for new notifications (low/normal/critical)",
        type: "string",
        choices: ["low", "normal", "critical"],
      },
      defaultURLHandler: {
        default: "",
        describe: "Default application to be used to open the HTTP URLs",
        type: "string",
      },
      disableAutogain: {
        default: false,
        describe: "A flag indicates whether to disable microphone auto gain control or not",
        type: "boolean",
      },
      disableGpu: {
        default: false,
        describe:
          "A flag to disable GPU and hardware acceleration (can be useful if the window remains blank)",
        type: "boolean",
      },
      disableNotifications: {
        default: false,
        describe: "A flag to disable all notifications",
        type: "boolean",
      },
      disableNotificationSound: {
        default: false,
        describe: "Disable chat/meeting start notification sound",
        type: "boolean",
      },
      disableNotificationSoundIfNotAvailable: {
        default: false,
        describe:
          "Disables notification sound unless status is Available (e.g. while in a call, busy, etc.)",
        type: "boolean",
      },
      disableNotificationWindowFlash: {
        default: false,
        describe:
          "A flag indicates whether to disable window flashing when there is a notification",
        type: "boolean",
      },
      disableGlobalShortcuts: {
        default: [],
        describe:
          "Array of global shortcuts to disable while the app is in focus. See https://www.electronjs.org/docs/latest/api/accelerator for available accelerators to use",
        type: "array",
      },
      electronCLIFlags: {
        default: [],
        describe: "Electron CLI flags",
        type: "array",
      },
      emulateWinChromiumPlatform: {
        default: false,
        describe:
          "Use windows platform information in chromium. This is helpful if MFA app does not support Linux.",
      },
      enableIncomingCallToast: {
        default: false,
        describe: "Enable incoming call toast",
        type: "boolean",
      },
      followSystemTheme: {
        default: false,
        describe: "Follow system theme",
        type: "boolean",
      },
      frame: {
        default: true,
        describe: "Specify false to create a Frameless Window. Default is true",
        type: "boolean",
      },
      incomingCallCommand: {
        default: null,
        describe:
          'Command to execute on an incoming call. (caution: "~" in path is not supported)',
        type: "string",
      },
      incomingCallCommandArgs: {
        default: [],
        describe: "Arguments for the incoming call command.",
        type: "array",
      },
      isCustomBackgroundEnabled: {
        default: false,
        describe: "A flag indicates whether to enable custom background or not",
        type: "boolean",
      },
      logConfig: {
        default: {
          transports: {
            console: {
              level: "info",
            },
            file: {
              level: false,
            },
          },
        },
        describe:
          "Electron-log configuration. See logger.js for configurable values. To disable it provide a Falsy value.",
        type: "object",
      },
      meetupJoinRegEx: {
        default:
          "^https://teams.(microsoft|live).com/.*(?:meetup-join|channel|chat)",
        describe: "Meetup-join and channel regular expression",
        type: "string",
      },
      menubar: {
        default: "auto",
        describe: "A value controls the menu bar behaviour",
        type: "string",
        choices: ["auto", "visible", "hidden"],
      },
      minimized: {
        default: false,
        describe: "Start the application minimized",
        type: "boolean",
      },
      notificationMethod: {
        default: "web",
        describe:
          "Notification method to be used by the application (web/electron)",
        type: "string",
        choices: ["web", "electron"],
      },
      onNewWindowOpenMeetupJoinUrlInApp: {
        default: true,
        describe:
          "Open meetupJoinRegEx URLs in the app instead of the default browser",
        type: "boolean",
      },
      partition: {
        default: "persist:teams-4-linux",
        describe: "BrowserWindow webpreferences partition",
        type: "string",
      },
      proxyServer: {
        default: null,
        describe: "Proxy Server with format address:port",
        type: "string",
      },
      sandbox: {
        default: true,
        deprecated:
          "Enabled by default and not configurable anymore. Please remove it from your configuration",
        describe:
          "Sandbox for the BrowserWindow (WIP - disabling this might break some functionality)",
        type: "boolean",
      },
      screenLockInhibitionMethod: {
        default: "Electron",
        describe:
          "Screen lock inhibition method to be used (Electron/WakeLockSentinel)",
        type: "string",
        choices: ["Electron", "WakeLockSentinel"],
      },
      spellCheckerLanguages: {
        default: [],
        describe:
          "Array of languages to use with Electron's spell checker (experimental)",
        type: "array",
      },
      ssoBasicAuthUser: {
        default: "",
        describe: "User to use for SSO basic auth.",
        type: "string",
      },
      ssoBasicAuthPasswordCommand: {
        default: "",
        describe: "Command to execute to retrieve password for SSO basic auth.",
        type: "string",
      },
      ssoInTuneEnabled: {
        default: false,
        describe: "Enable Single-Sign-On using Microsoft InTune.",
        type: "boolean",
      },
      ssoInTuneAuthUser: {
        default: "",
        describe: "User (e-mail) to use for InTune SSO.",
        type: "string",
      },
      trayIconEnabled: {
        default: true,
        describe: "Enable tray icon",
        type: "boolean",
      },
      msTeamsProtocols: {
        default: {
          v1: "^msteams:/l/(?:meetup-join|channel|chat|message)",
          v2: "^msteams://teams.microsoft.com/l/(?:meetup-join|channel|chat|message)",
        },
        describe:
          "Regular expressions for Microsoft Teams protocol links (v1 and v2).",
        type: "object",
      },
      url: {
        default: "https://teams.microsoft.com/v2",
        describe: "Microsoft Teams URL",
        type: "string",
      },
      useMutationTitleLogic: {
        default: true,
        describe: "Use MutationObserver to update counter from title",
        type: "boolean",
      },
      watchConfigFile: {
        default: false,
        describe: "Watch for changes in the config file and reload the app",
        type: "boolean",
      },
      webDebug: {
        default: false,
        describe: "Enable debug at start",
        type: "boolean",
      },
      videoMenu: {
        default: false,
        describe: "Enable menu entry for controlling video elements",
        type: "boolean",
      },
    })
    .help()
    .parse(process.argv.slice(1));
}

function checkUsedDeprecatedValues(configObject, config) {
  const deprecatedOptions = yargs.getDeprecatedOptions();
  for (const option in deprecatedOptions) {
    if (option in configObject.configFile) {
      const deprecatedWarningMessage = `Option \`${option}\` is deprecated and will be removed in future version. \n ${deprecatedOptions[option]}.`;
      console.warn(deprecatedWarningMessage);
      config["warning"] = deprecatedWarningMessage;
    } else {
      console.debug(`all good with ${option} you aren't using them`);
    }
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

  let config = extractYargConfig(configObject, appVersion);

  if (configObject.configError) {
    config["error"] = configObject.configError;
  }

  checkUsedDeprecatedValues(configObject, config);

  if (configObject.isConfigFile && config.watchConfigFile) {
    fs.watch(getConfigFilePath(configPath), (event, filename) => {
      console.info(
        `Config file ${filename} changed ${event}. Relaunching app...`
      );
      ipcMain.emit("config-file-changed");
    });
  }

  logger.init(config.logConfig);

  console.info("configPath:", configPath);
  console.debug("configFile:", configObject.configFile);

  return config;
}

exports = module.exports = argv;

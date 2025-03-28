const yargs = require("yargs");
const fs = require("fs");
const path = require("path");
const { ipcMain } = require("electron");
const logger = require("./logger");
const { deprecate } = require("util");

function getConfigFilePath(configPath) {
  return path.join(configPath, "config.json");
}

function checkConfigFileExistence(configPath) {
  return fs.existsSync(getConfigFilePath(configPath));
}

function getConfigFile(configPath) {
  return require(getConfigFilePath(configPath));
}

function populateConfigObjectFromFile(configObject, configPath) {
  if (checkConfigFileExistence(configPath)) {
    try {
      configObject.configFile = getConfigFile(configPath);
      configObject.isConfigFile = true;
    } catch (e) {
      configObject.configError = e.message;
      console.warn(
        "Error in config file, using default values:\n" +
          configObject.configError
      );
    }
  } else {
    console.warn("No config file found, using default values");
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
      appLogLevels: {
        deprecated: "Use `logConfig` instead",
        default: "error,warn,info,debug",
        describe: "Comma separated list of log levels (error,warn,info,debug)",
        type: "string",
      },
      appTitle: {
        default: "Microsoft Teams",
        describe: "A text to be suffixed with page title",
        type: "string",
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
      customBGServiceIgnoreMSDefaults: {
        default: false,
        describe:
          "A flag indicates whether to ignore Microsoft provided images or not",
        type: "boolean",
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
        default: false,
        describe:
          "Use contextIsolation on the main BrowserWindow (WIP - Disabling this will break most functionality)",
        type: "boolean",
      },
      customUserDir: {
        default: null,
        deprecated: "Use `ELECTRON_USER_DATA_PATH` env variable instead",
        describe:
          "Custom User Directory so that you can have multiple profiles",
        type: "string",
      },
      class: {
        default: null,
        describe: "A custom value for the WM_CLASS property",
        type: "string",
      },
      clearStorage: {
        default: false,
        describe:
          "Whether to clear the storage before creating the window or not",
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
        describe: "A flag indicates whether to disable mic auto gain or not",
        type: "boolean",
      },
      disableGpu: {
        default: false,
        describe:
          "A flag to disable GPU and hardware acceleration (can be useful if the window remains blank)",
        type: "boolean",
      },
      disableMeetingNotifications: {
        default: false,
        describe: "Whether to disable meeting notifications or not",
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
        describe: "Command to execute on an incoming call.",
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
              level: "debug",
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
          "^https://teams.(microsoft|live).com/.*(?:meetup-join|channel)",
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
      ntlmV2enabled: {
        default: "true",
        describe: "Set enable-ntlm-v2 value",
        type: "string",
      },
      optInTeamsV2: {
        default: false,
        describe: "Opt in to use Teams V2",
        type: "boolean",
      },
      partition: {
        default: "persist:teams-4-linux",
        describe: "BrowserWindow webpreferences partition",
        type: "string",
      },
      permissionHandlersConfig: {
        default: {
          allowedDomains: [
            "microsoft.com",
            "microsoftonline.com",
            "teams.skype.com",
            "teams.microsoft.com",
            "sfbassets.com",
            "skypeforbusiness.com",
            "outlook.office.com",
            "microsoftazuread-sso.com",
            "teams.live.com",
            "sharepoint.com",
            "outlook.office.com",
          ],
          ///autologon.microsoftazuread-sso.com
          allowedPermissions: [
            "background-sync",
            "notifications",
            "media",
            "speaker-selection",
            "clipboard-read",
            "clipboard-write",
            "clipboard-sanitized-write",
            "screen-wake-lock",
            "persistent-storage",
            "geolocation",
          ],
        },
        describe: "Permission Handlers configuration",
        type: "object",
      },
      proxyServer: {
        default: null,
        describe: "Proxy Server with format address:port",
        type: "string",
      },
      sandbox: {
        default: false,
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
      url: {
        default: "https://teams.microsoft.com",
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

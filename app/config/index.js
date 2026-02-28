const yargs = require("yargs");
const fs = require("node:fs");
const path = require("node:path");
const { ipcMain } = require("electron");
const logger = require("./logger");
const defaults = require("./defaults");

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
    .options({
      appActiveCheckInterval: {
        default: 2,
        describe:
          "A numeric value in seconds as poll interval to check if the system is active from being idle",
        type: "number",
      },
      screenSharing: {
        default: {
          thumbnail: {
            enabled: true,
            alwaysOnTop: true,
          },
          lockInhibitionMethod: "Electron",
        },
        describe:
          "Screen sharing configuration. thumbnail: controls the preview window shown during active sharing. lockInhibitionMethod: screen lock inhibition method (Electron/WakeLockSentinel).",
        type: "object",
      },
      screenSharingThumbnail: {
        default: {
          enabled: true,
          alwaysOnTop: true,
        },
        deprecated: "Use screenSharing.thumbnail instead. This option will be removed in a future version.",
        describe:
          "[DEPRECATED] Use screenSharing.thumbnail instead. Controls the thumbnail preview window during active screen sharing.",
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
          enabled: false,
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
        describe: "DEPRECATED: Use media.microphone.disableAutogain instead",
        type: "boolean",
        deprecated: "Use media.microphone.disableAutogain instead",
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
      disableBadgeCount: {
        default: false,
        describe:
          "A flag indicates whether to disable the badge counter on the taskbar/dock icon",
        type: "boolean",
      },
      disableGlobalShortcuts: {
        default: [],
        describe:
          "Array of global shortcuts to disable while the app is in focus. See https://www.electronjs.org/docs/latest/api/accelerator for available accelerators to use",
        type: "array",
      },
      globalShortcuts: {
        default: [],
        describe:
          "Global keyboard shortcuts that work system-wide. Disabled by default (opt-in). See configuration docs for details and limitations",
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
        default: defaults.meetupJoinRegEx,
        describe: "Regex for Teams meetup-join and related links",
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
          "Notification method to be used by the application (web/electron/custom)",
        type: "string",
        choices: ["web", "electron", "custom"],
      },
      customNotification: {
        default: {
          toastDuration: 5000,
        },
        describe:
          "Custom in-app notification system configuration",
        type: "object",
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
      screenLockInhibitionMethod: {
        default: "Electron",
        deprecated: "Use screenSharing.lockInhibitionMethod instead. This option will be removed in a future version.",
        describe:
          "[DEPRECATED] Use screenSharing.lockInhibitionMethod instead. Screen lock inhibition method (Electron/WakeLockSentinel).",
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
        deprecated: "Use auth.intune.enabled instead",
      },
      ssoInTuneAuthUser: {
        default: "",
        describe: "User (e-mail) to use for InTune SSO.",
        type: "string",
        deprecated: "Use auth.intune.user instead",
      },
      trayIconEnabled: {
        default: true,
        describe: "Enable tray icon",
        type: "boolean",
      },
      msTeamsProtocols: {
        default: {
          v1: "^msteams:/l/(?:meetup-join|channel|chat|message)",
          v2: "^msteams://teams.(?:microsoft.com|cloud.microsoft)/l/(?:meetup-join|channel|chat|message)",
        },
        describe:
          "Regular expressions for Microsoft Teams protocol links (v1 and v2).",
        type: "object",
      },
      url: {
        default: "https://teams.cloud.microsoft",
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
        describe: "DEPRECATED: Use media.video.menuEnabled instead",
        type: "boolean",
        deprecated: "Use media.video.menuEnabled instead",
      },
      media: {
        default: {
          microphone: { disableAutogain: false },
          camera: {
            resolution: { enabled: false, mode: "remove" },
            autoAdjustAspectRatio: { enabled: false },
          },
          video: { menuEnabled: false },
        },
        describe: "Media settings for microphone, camera, and video",
        type: "object",
      },
      mqtt: {
        default: {
          enabled: false,
          brokerUrl: "",
          username: "",
          password: "",
          clientId: "teams-for-linux",
          topicPrefix: "teams",
          statusTopic: "status",
          commandTopic: "",
          statusCheckInterval: 10000,
        },
        describe: "MQTT configuration for publishing Teams status updates and receiving action commands",
        type: "object",
      },
      quickChat: {
        default: {
          enabled: false,
        },
        describe: "Quick Chat configuration for quick access to chat contacts and inline messaging via Graph API",
        type: "object",
      },
      graphApi: {
        default: {
          enabled: false,
        },
        describe: "Microsoft Graph API integration for enhanced Teams functionality (calendar, user profile, etc.)",
        type: "object",
      },
      auth: {
        default: {
          intune: {
            enabled: false,
            user: "",
          },
        },
        describe: "Authentication configuration (currently supports Intune SSO)",
        type: "object",
      },
      wayland: {
        default: {
          xwaylandOptimizations: false,
        },
        describe: "Wayland display server configuration. xwaylandOptimizations: keeps GPU enabled and skips fake media UI flag under XWayland (may fix camera issues but can break screen sharing)",
        type: "object",
      },
    })
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
  console.debug("configFile:", configObject.configFile);

  return config;
}

exports = module.exports = argv;

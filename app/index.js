const {
  app,
  dialog,
  ipcMain,
  globalShortcut,
  systemPreferences,
  nativeImage,
} = require("electron");
const path = require("node:path");
const CustomBackground = require("./customBackground");
const { MQTTClient } = require("./mqtt");
const MQTTMediaStatusService = require("./mqtt/mediaStatusService");
const GraphApiClient = require("./graphApi");
const { registerGraphApiHandlers } = require("./graphApi/ipcHandlers");
const { validateIpcChannel, allowedChannels } = require("./security/ipcValidator");
const { register: registerGlobalShortcuts, sendKeyboardEventToWindow } = require("./globalShortcuts");
const CommandLineManager = require("./startup/commandLine");
const NotificationService = require("./notifications/service");
const CustomNotificationManager = require("./notificationSystem");
const QuickChatManager = require("./quickChat");
const ScreenSharingService = require("./screenSharing/service");
const PartitionsManager = require("./partitions/manager");
const IdleMonitor = require("./idle/monitor");
const AutoUpdater = require("./autoUpdater");
const os = require("node:os");
const isMac = os.platform() === "darwin";

const { NETWORK_ERROR_PATTERNS } = require("./config/defaults");

function isNetworkError(message) {
  return typeof message === 'string' && NETWORK_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

// Top-level error handlers for crash diagnostics
process.on('uncaughtException', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  if (isNetworkError(message)) {
    console.error('[ERROR] Network-related uncaught exception (not terminating):', { message });
    return;
  }
  console.error('[FATAL] Uncaught exception:', { message, stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  if (isNetworkError(message)) {
    console.error('[ERROR] Network-related unhandled rejection (not terminating):', { message });
    return;
  }
  console.error('[FATAL] Unhandled promise rejection:', { message, stack });
  process.exit(1);
});

// Support for E2E testing: use temporary userData directory for clean state
if (process.env.E2E_USER_DATA_DIR) {
  app.setPath("userData", process.env.E2E_USER_DATA_DIR);
}

// This must be executed before loading the config file.
CommandLineManager.addSwitchesBeforeConfigLoad();

// Load config file.
const { AppConfiguration } = require("./appConfiguration");
const appConfig = new AppConfiguration(
  app.getPath("userData"),
  app.getVersion()
);

const config = appConfig.startupConfig;
config.appPath = path.join(__dirname, app.isPackaged ? "../../" : "");

CommandLineManager.addSwitchesAfterConfigLoad(config);

let userStatus = -1;
let mqttClient = null;
let mqttMediaStatusService = null;
let graphApiClient = null;
let quickChatManager = null;

let player;
try {
  const { NodeSound } = require("node-sound");
  player = NodeSound.getDefaultPlayer();
} catch (err) {
  console.warn(
    `No audio players found. Audio notifications might not work. ${err}`
  );
}

const certificateModule = require("./certificate");
const CacheManager = require("./cacheManager");
const gotTheLock = app.requestSingleInstanceLock();
const mainAppWindow = require("./mainAppWindow");

// Getter function for user status - injected into NotificationService to break coupling
const getUserStatus = () => userStatus;

// Initialize notification service with dependencies
const notificationService = new NotificationService(
  player,
  config,
  mainAppWindow,
  getUserStatus
);

// Initialize screen sharing service
const screenSharingService = new ScreenSharingService();

// Initialize partitions manager with dependencies
const partitionsManager = new PartitionsManager(appConfig.settingsStore);

// Initialize idle monitor with dependencies
const idleMonitor = new IdleMonitor(config, getUserStatus);

// Initialize custom notification manager for toast notifications
const customNotificationManager = new CustomNotificationManager(config, mainAppWindow);

if (isMac) {
  requestMediaAccess();
}

const protocolClient = "msteams";
if (!app.isDefaultProtocolClient(protocolClient, process.execPath)) {
  app.setAsDefaultProtocolClient(protocolClient, process.execPath);
}

if (gotTheLock) {
  app.on("second-instance", mainAppWindow.onAppSecondInstance);
  app.on("ready", handleAppReady);
  app.on("quit", () => console.debug("quit"));
  app.on("render-process-gone", onRenderProcessGone);
  app.on("will-quit", async () => {
    console.debug("will-quit");
    if (mqttClient) {
      await mqttClient.disconnect();
    }
  });
  app.on("certificate-error", handleCertificateError);
  app.on("browser-window-focus", handleGlobalShortcutDisabled);
  app.on("browser-window-blur", handleGlobalShortcutDisabledRevert);

  // IPC Security: Add validation wrappers for all IPC handlers
  const originalIpcHandle = ipcMain.handle.bind(ipcMain);
  const originalIpcOn = ipcMain.on.bind(ipcMain);

  ipcMain.handle = (channel, handler) => {
    return originalIpcHandle(channel, (event, ...args) => {
      if (!validateIpcChannel(channel, args.length > 0 ? args[0] : null)) {
        console.error(`[IPC Security] Rejected handle request for channel: ${channel}`);
        return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
      }
      return handler(event, ...args);
    });
  };

  ipcMain.on = (channel, handler) => {
    return originalIpcOn(channel, (event, ...args) => {
      if (!validateIpcChannel(channel, args.length > 0 ? args[0] : null)) {
        console.error(`[IPC Security] Rejected event for channel: ${channel}`);
        return;
      }
      return handler(event, ...args);
    });
  };

  // Restart application when configuration file changes
  ipcMain.on("config-file-changed", restartApp);
  // Get current application configuration
  ipcMain.handle("get-config", async () => {
    return config;
  });

  // Initialize notification service IPC handlers
  notificationService.initialize();

  // Initialize screen sharing service IPC handlers
  screenSharingService.initialize();

  // Initialize partitions manager IPC handlers
  partitionsManager.initialize();

  // Initialize idle monitor IPC handlers
  idleMonitor.initialize();

  // Initialize custom notification manager for toast notifications
  customNotificationManager.initialize();

  // Handle user status changes from Teams (e.g., Available, Busy, Away)
  ipcMain.handle("user-status-changed", userStatusChangedHandler);
  // Set application badge count (dock/taskbar notification)
  ipcMain.handle("set-badge-count", setBadgeCountHandler);
  // Get application version number
  ipcMain.handle("get-app-version", async () => {
    return config.appVersion;
  });

  // Navigate back in browser history
  ipcMain.on("navigate-back", (event) => {
    const webContents = event.sender;
    if (webContents?.navigationHistory?.canGoBack()) {
      console.debug("Navigating back");
      webContents.navigationHistory.goBack();
    }
  });

  // Navigate forward in browser history
  ipcMain.on("navigate-forward", (event) => {
    const webContents = event.sender;
    if (webContents?.navigationHistory?.canGoForward()) {
      console.debug("Navigating forward");
      webContents.navigationHistory.goForward();
    }
  });

  // Get current navigation state (can go back/forward)
  ipcMain.handle("get-navigation-state", (event) => {
    const webContents = event.sender;
    return {
      canGoBack: webContents?.navigationHistory?.canGoBack() || false,
      canGoForward: webContents?.navigationHistory?.canGoForward() || false,
    };
  });
} else {
  console.info("App already running");
  app.quit();
}

function restartApp() {
  console.info("Restarting app...");
  app.relaunch();
  app.exit();
}

/**
 * Handles the 'render-process-gone' event.
 *
 * When a renderer process (which hosts the web content, i.e., the Teams PWA)
 * crashes or becomes unresponsive, Electron emits this event.
 *
 * The decision to immediately quit the application here is a design choice.
 * A renderer process going "gone" often indicates a severe, unrecoverable
 * issue with the web content or its interaction with Electron. Attempting
 * to continue running with a crashed renderer can lead to an unstable
 * and unpredictable user experience (e.g., blank screens, unresponsive UI).
 *
 * Quitting ensures a clean restart, allowing the user to relaunch the
 * application and potentially recover from the issue.
 *
 * @param {Electron.Event} event - The event object.
 * @param {Electron.WebContents} webContents - The WebContents that crashed.
 * @param {Electron.RenderProcessGoneDetails} details - Details about the crash.
 */
function onRenderProcessGone(event, webContents, details) {
  console.error(`render-process-gone ${JSON.stringify(details)}`);
  app.quit();
}

function onAppTerminated(signal) {
  if (signal === "SIGTERM") {
    process.abort();
  } else {
    app.quit();
  }
}

function handleShortcutCommand({ action, shortcut }) {
  if (!shortcut) return;

  const window = mainAppWindow.getWindow();
  if (window && !window.isDestroyed()) {
    sendKeyboardEventToWindow(window, shortcut);
    console.info(`[MQTT] Executed command '${action}' -> ${shortcut}`);
  } else {
    console.warn(`[MQTT] Cannot execute command '${action}': window not available`);
  }
}

function initializeMqtt() {
  mqttClient = new MQTTClient(config);

  async function handleGetCalendarCommand({ startDate, endDate }) {
    if (!startDate || !endDate) {
      console.error('[MQTT] get-calendar requires startDate and endDate');
      return;
    }

    if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) {
      console.error('[MQTT] get-calendar requires startDate and endDate in valid ISO 8601 format');
      return;
    }

    if (!graphApiClient) {
      console.error('[MQTT] get-calendar failed: Graph API client not initialized');
      return;
    }

    console.info(`[MQTT] Fetching calendar events from ${startDate} to ${endDate}`);

    try {
      const result = await graphApiClient.getCalendarView(startDate, endDate);

      if (result.success) {
        await mqttClient.publishToTopic('calendar', result);
        console.info('[MQTT] Calendar data published to teams/calendar topic');
      } else {
        console.error('[MQTT] Failed to get calendar:', result.error);
      }
    } catch (error) {
      console.error('[MQTT] Error fetching calendar:', error);
    }
  }

  async function handleMqttCommand(command) {
    const { action } = command;

    if (action === 'get-calendar') {
      await handleGetCalendarCommand(command);
    } else {
      handleShortcutCommand(command);
    }
  }

  mqttClient.on('command', handleMqttCommand);
  mqttClient.initialize();

  mqttMediaStatusService = new MQTTMediaStatusService(mqttClient, config);
  mqttMediaStatusService.initialize();
}

function showConfigurationDialogs() {
  if (config.error) {
    dialog.showMessageBox({
      title: "Configuration Error",
      icon: nativeImage.createFromPath(
        path.join(config.appPath, "assets/icons/setting-error.256x256.png")
      ),
      message: `Error in config file '${config.error}'.\n Loading default configuration`,
    });
  }
  if (config.warnings && config.warnings.length > 0) {
    dialog.showMessageBox({
      title: "Configuration Warning",
      icon: nativeImage.createFromPath(
        path.join(config.appPath, "assets/icons/alert-diamond.256x256.png")
      ),
      message: config.warnings.join("\n\n"),
    });
  }
}

function loadMenuToggleSettings() {
  const menuToggleSettings = [
    'disableNotifications',
    'disableNotificationSound',
    'disableNotificationSoundIfNotAvailable',
    'disableNotificationWindowFlash',
    'disableBadgeCount',
    'defaultNotificationUrgency'
  ];

  for (const setting of menuToggleSettings) {
    if (appConfig.legacyConfigStore.has(setting)) {
      config[setting] = appConfig.legacyConfigStore.get(setting);
    }
  }
}

function initializeGraphApiClient() {
  if (!config.graphApi?.enabled) return;

  graphApiClient = new GraphApiClient(config);
  const mainWindow = mainAppWindow.getWindow();
  if (mainWindow) {
    graphApiClient.initialize(mainWindow);
    console.debug("[GRAPH_API] Graph API client initialized with main window");
  } else {
    console.warn("[GRAPH_API] Main window not available, Graph API client not fully initialized");
  }
}

function initializeQuickChat() {
  const mainWindow = mainAppWindow.getWindow();
  if (!mainWindow) return;

  quickChatManager = new QuickChatManager(config, mainWindow);
  quickChatManager.initialize();
  mainAppWindow.setQuickChatManager(quickChatManager);

  const quickChatShortcut = config.quickChat?.shortcut;
  if (quickChatManager.isEnabled() && quickChatShortcut) {
    const registered = globalShortcut.register(quickChatShortcut, () => {
      quickChatManager.toggle();
    });
    if (registered) {
      console.info('[QuickChat] Global keyboard shortcut registered (works even when app is not focused)');
    } else {
      console.info('[QuickChat] Global shortcut not available; keyboard shortcut works via application menu when app is focused');
    }
  }
}

function initializeCacheManagement() {
  if (!config.cacheManagement?.enabled) return;

  const cacheManager = new CacheManager({
    maxCacheSizeMB: config.cacheManagement?.maxCacheSizeMB || 600,
    cacheCheckIntervalMs:
      config.cacheManagement?.cacheCheckIntervalMs || 60 * 60 * 1000,
    partition: config.partition,
  });
  cacheManager.start();

  app.on("before-quit", () => {
    cacheManager.stop();
  });
}

function initializeAutoUpdater() {
  const mainWindow = mainAppWindow.getWindow();
  if (mainWindow) {
    AutoUpdater.initialize(mainWindow);
  }
}

async function handleAppReady() {
  try {
    showConfigurationDialogs();

    process.on("SIGTRAP", onAppTerminated);
    process.on("SIGINT", onAppTerminated);
    process.on("SIGTERM", onAppTerminated);
    process.stdout.on("error", () => {});

    initializeCacheManagement();

    if (config.mqtt?.enabled) {
      initializeMqtt();
    }

    loadMenuToggleSettings();

    await mainAppWindow.onAppReady(appConfig, new CustomBackground(app, config), screenSharingService);

    initializeGraphApiClient();
    registerGraphApiHandlers(ipcMain, graphApiClient);
    initializeQuickChat();
    registerGlobalShortcuts(config, mainAppWindow, app);
    initializeAutoUpdater();

    console.info('[IPC Security] Channel allowlisting enabled');
    console.info(`[IPC Security] ${allowedChannels.size} channels allowlisted`);
  } catch (error) {
    console.error('[STARTUP] Fatal error during app initialization:', { message: error.message, stack: error.stack });
    app.quit();
  }
}

function handleCertificateError(event, webContents, url, error, certificate, callback) {
  certificateModule.onAppCertificateError({
    event,
    webContents,
    url,
    error,
    certificate,
    callback,
    config,
  });
}

async function requestMediaAccess() {
  for (const permission of ["camera", "microphone"]) {
    const status = await systemPreferences
      .askForMediaAccess(permission)
      .catch((err) => {
        console.error(
          `Error while requesting access for "${permission}": ${err}`
        );
      });
    console.debug(
      `mac permission ${permission} asked current status ${status}`
    );
  }
}

async function userStatusChangedHandler(_event, options) {
  userStatus = options.data.status;

  // Publish status to MQTT if enabled
  if (mqttClient) {
    await mqttClient.publishStatus(userStatus);
  }
}

async function setBadgeCountHandler(_event, count) {
  if (!config.disableBadgeCount) {
    app.setBadgeCount(count);
  }
}

function handleGlobalShortcutDisabled() {
  for (const shortcut of config.disableGlobalShortcuts) {
    if (shortcut) {
      globalShortcut.register(shortcut, () => {
        console.debug(`Global shortcut ${shortcut} disabled`);
      });
    }
  }
}

function handleGlobalShortcutDisabledRevert() {
  for (const shortcut of config.disableGlobalShortcuts) {
    if (shortcut) {
      globalShortcut.unregister(shortcut);
    }
  }
}

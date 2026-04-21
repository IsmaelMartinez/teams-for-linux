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
  if (typeof message !== 'string') return false;
  if (NETWORK_ERROR_PATTERNS.some(pattern => message.includes(pattern))) return true;
  // "Object has been destroyed" errors can occur when the window is destroyed
  // during network-triggered operations (e.g., reload after network recovery).
  // These are transient and should not terminate the app.
  if (message.includes('Object has been destroyed')) return true;
  // "Script failed to execute" occurs when executeJavaScript runs on a page where
  // APIs are unavailable (e.g., Chrome error pages after ERR_NAME_NOT_RESOLVED).
  // This is a symptom of network failure, not a fatal error.
  if (message.includes('Script failed to execute')) return true;
  return false;
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

// ADR-020: multi-account is mutually exclusive with Intune MAM.
// The Linux D-Bus Microsoft Identity Broker has undocumented behavior
// around concurrent enrollments for different UPNs on one machine, so
// force multi-account off when Intune is enabled via either the current
// `auth.intune.enabled` or the legacy `ssoInTuneEnabled` flag.
const intuneEnabled =
  config.auth?.intune?.enabled || config.ssoInTuneEnabled;
if (config.multiAccount?.enabled && intuneEnabled) {
  const warning =
    "[MultiAccount] Intune SSO is enabled (auth.intune.enabled or ssoInTuneEnabled); multi-account is not supported in this configuration and will be disabled for this session.";
  console.warn(warning);
  config.warnings = [...(config.warnings || []), warning];
  config.multiAccount.enabled = false;
}

let userStatus = -1;
let mqttClient = null;
let mqttMediaStatusService = null;
let graphApiClient = null;
let quickChatManager = null;

const { createPlayer } = require("./audio/player");
const player = createPlayer();

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

  // IPC Security: wrap handler-registration methods so every renderer-initiated
  // IPC call is validated against the allowlist in app/security/ipcValidator.js.
  const originalIpcHandle = ipcMain.handle.bind(ipcMain);
  const originalIpcOn = ipcMain.on.bind(ipcMain);
  const originalIpcOnce = ipcMain.once.bind(ipcMain);

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

  ipcMain.once = (channel, handler) => {
    return originalIpcOnce(channel, (event, ...args) => {
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

  // Log renderer-side unhandled promise rejections
  ipcMain.on("unhandled-rejection", (_event, errorData) => {
    // Payload is constructed and length-capped in app/browser/preload.js;
    // prior to this handler + the ipcValidator allowlist entry these
    // messages were silently dropped. Fields are run through
    // sanitizeRendererLogField to scrub URL query strings before logging.
    try {
      console.error("[Renderer] Unhandled rejection:", {
        message: sanitizeRendererLogField(errorData?.message, "unknown"),
        stack: sanitizeRendererLogField(errorData?.stack),
        timestamp: toFiniteNumber(errorData?.timestamp, Date.now()),
      });
    } catch (err) {
      console.error("[Renderer] Failed to log unhandled-rejection:", err);
    }
  });

  // Log renderer-side uncaught window errors
  ipcMain.on("window-error", (_event, errorData) => {
    try {
      console.error("[Renderer] Window error:", {
        message: sanitizeRendererLogField(errorData?.message, "unknown"),
        filename: sanitizeRendererLogField(errorData?.filename, "") || "",
        lineno: toFiniteNumber(errorData?.lineno, 0),
        colno: toFiniteNumber(errorData?.colno, 0),
        errorStack: sanitizeRendererLogField(errorData?.errorStack),
        timestamp: toFiniteNumber(errorData?.timestamp, Date.now()),
      });
    } catch (err) {
      console.error("[Renderer] Failed to log window-error:", err);
    }
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

const MAX_RENDERER_LOG_FIELD_LENGTH = 4096;

/**
 * Sanitizes a renderer-supplied log string before it hits main-process logs.
 * Strips the query string / fragment from any URL in the value (Teams CDN
 * URLs can carry cache-busting or auth tokens) and length-caps the result.
 * Non-strings fall back to the supplied fallback.
 *
 * @param {unknown} value - The field value to sanitize.
 * @param {any} fallback - Value to return when `value` is not a string.
 * @returns {string|any} - Sanitized string, or `fallback` for non-strings.
 */
function sanitizeRendererLogField(value, fallback = null) {
  if (typeof value !== "string") return fallback;

  const redacted = value.replaceAll(
    /(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#)'"<>]+)[?#][^\s)'"<>]*/gi,
    "$1[redacted]",
  );

  return redacted.length > MAX_RENDERER_LOG_FIELD_LENGTH
    ? `${redacted.slice(0, MAX_RENDERER_LOG_FIELD_LENGTH)}…`
    : redacted;
}

/**
 * Coerces a renderer-supplied scalar to a finite number, falling back to a
 * caller-supplied default for anything non-numeric or NaN/Infinity. Prevents
 * arbitrary objects or strings from leaking into main-process logs via the
 * error-forwarding IPC channels.
 *
 * @param {unknown} value - The field value to coerce.
 * @param {number} fallback - Value returned when `value` isn't a finite number.
 * @returns {number}
 */
function toFiniteNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function onAppTerminated() {
  app.quit();
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

    const customBackground = new CustomBackground(app, config);
    customBackground.initialize();
    await mainAppWindow.onAppReady(appConfig, customBackground, screenSharingService);

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
    try {
      await mqttClient.publishStatus(userStatus);
    } catch (error) {
      console.error('[MQTT] Failed to publish status:', error);
    }
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

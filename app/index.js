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
const GraphApiClient = require("./graphApi");
const { registerGraphApiHandlers } = require("./graphApi/ipcHandlers");
const { validateIpcChannel, allowedChannels } = require("./security/ipcValidator");
const globalShortcuts = require("./globalShortcuts");
const CommandLineManager = require("./startup/commandLine");
const NotificationService = require("./notifications/service");
const CustomNotificationManager = require("./notificationSystem");
const ScreenSharingService = require("./screenSharing/service");
const PartitionsManager = require("./partitions/manager");
const IdleMonitor = require("./idle/monitor");
const os = require("node:os");
const isMac = os.platform() === "darwin";

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
let graphApiClient = null;

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

// Initialize screen sharing service with dependencies
const screenSharingService = new ScreenSharingService(mainAppWindow);

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

app.allowRendererProcessReuse = false;

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

  // Screen sharing IPC handlers
  ipcMain.on("screen-sharing-started", (event, sourceId) => {
    try {
      console.debug("[SCREEN_SHARE_DIAG] Screen sharing session started", {
        receivedSourceId: sourceId,
        existingSourceId: globalThis.selectedScreenShareSource,
        timestamp: new Date().toISOString(),
        hasExistingPreview: globalThis.previewWindow && !globalThis.previewWindow.isDestroyed(),
        mainWindowVisible: mainAppWindow?.isVisible?.() || false,
        mainWindowFocused: mainAppWindow?.isFocused?.() || false
      });

      // Only update if we received a valid source ID
      if (sourceId) {
        // Validate format - must be screen:x:y or window:x:y (not UUID)
        const isValidFormat = sourceId.startsWith('screen:') || sourceId.startsWith('window:');

        if (isValidFormat) {
          console.debug("[SCREEN_SHARE_DIAG] Received valid source ID format, updating", {
            sourceId: sourceId,
            sourceType: sourceId.startsWith('screen:') ? 'screen' : 'window'
          });
          globalThis.selectedScreenShareSource = sourceId;
        } else {
          // UUID format detected - this is the bug we're fixing
          console.warn("[SCREEN_SHARE_DIAG] Received invalid source ID format (UUID?), keeping existing", {
            received: sourceId,
            existing: globalThis.selectedScreenShareSource,
            note: "MediaStream.id (UUID) cannot be used for preview window - see ADR"
          });
          // Keep existing value, don't overwrite
        }
      } else {
        console.debug("[SCREEN_SHARE_DIAG] No source ID received (null), keeping existing", {
          existing: globalThis.selectedScreenShareSource,
          note: "Source ID was already set correctly by setupScreenSharing()"
        });
      }

      console.debug("[SCREEN_SHARE_DIAG] Screen sharing source registered", {
        sourceId: globalThis.selectedScreenShareSource,
        sourceType: globalThis.selectedScreenShareSource?.startsWith?.('screen:') ? 'screen' : 'window',
        willCreatePreview: true
      });

    } catch (error) {
      console.error("[SCREEN_SHARE_DIAG] Error handling screen-sharing-started event", {
        error: error.message,
        sourceId: sourceId,
        stack: error.stack
      });
    }
  });

  ipcMain.on("screen-sharing-stopped", () => {
    console.debug("[SCREEN_SHARE_DIAG] Screen sharing session stopped", {
      timestamp: new Date().toISOString(),
      stoppedSource: globalThis.selectedScreenShareSource,
      previewWindowExists: globalThis.previewWindow && !globalThis.previewWindow.isDestroyed(),
      mainWindowState: {
        visible: mainAppWindow?.isVisible?.() || false,
        focused: mainAppWindow?.isFocused?.() || false
      }
    });

    globalThis.selectedScreenShareSource = null;

    // Close preview window when screen sharing stops
    if (globalThis.previewWindow && !globalThis.previewWindow.isDestroyed()) {
      console.debug("[SCREEN_SHARE_DIAG] Closing preview window after screen sharing stopped");
      globalThis.previewWindow.close();
    } else {
      console.debug("[SCREEN_SHARE_DIAG] No preview window to close");
    }
  });

  // Preview window management IPC handlers
  ipcMain.handle("get-screen-sharing-status", () => {
    return globalThis.selectedScreenShareSource !== null;
  });

  ipcMain.handle("get-screen-share-stream", () => {
    // Return the source ID - handle both string and object formats
    if (typeof globalThis.selectedScreenShareSource === "string") {
      return globalThis.selectedScreenShareSource;
    } else if (globalThis.selectedScreenShareSource?.id) {
      return globalThis.selectedScreenShareSource.id;
    }
    return null;
  });

  ipcMain.handle("get-screen-share-screen", () => {
    // Return screen dimensions if available from StreamSelector, otherwise default
    if (
      globalThis.selectedScreenShareSource &&
      typeof globalThis.selectedScreenShareSource === "object"
    ) {
      const { screen } = require("electron");
      const displays = screen.getAllDisplays();

      if (globalThis.selectedScreenShareSource?.id?.startsWith("screen:")) {
        const display = displays[0] || { size: { width: 1920, height: 1080 } };
        return { width: display.size.width, height: display.size.height };
      }
    }

    return { width: 1920, height: 1080 };
  });

  ipcMain.on("resize-preview-window", (event, { width, height }) => {
    if (globalThis.previewWindow && !globalThis.previewWindow.isDestroyed()) {
      const [minWidth, minHeight] = globalThis.previewWindow.getMinimumSize();
      const newWidth = Math.max(minWidth, Math.min(width, 480));
      const newHeight = Math.max(minHeight, Math.min(height, 360));
      globalThis.previewWindow.setSize(newWidth, newHeight);
      globalThis.previewWindow.center();
    }
  });

  ipcMain.on("stop-screen-sharing-from-thumbnail", () => {
    globalThis.selectedScreenShareSource = null;
    if (globalThis.previewWindow && !globalThis.previewWindow.isDestroyed()) {
      globalThis.previewWindow.webContents.send("screen-sharing-status-changed");
    }
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

function handleAppReady() {
  // check for configuration errors
  if (config.error) {
    dialog.showMessageBox({
      title: "Configuration Error",
      icon: nativeImage.createFromPath(
        path.join(config.appPath, "assets/icons/setting-error.256x256.png")
      ),
      message: `Error in config file '${config.error}'.\n Loading default configuration`,
    });
  }
  // check for configuration warnings
  if (config.warning) {
    dialog.showMessageBox({
      title: "Configuration Warning",
      icon: nativeImage.createFromPath(
        path.join(config.appPath, "assets/icons/alert-diamond.256x256.png")
      ),
      message: config.warning,
    });
  }

  process.on("SIGTRAP", onAppTerminated);
  process.on("SIGINT", onAppTerminated);
  process.on("SIGTERM", onAppTerminated);
  //Just catch the error
  process.stdout.on("error", () => {});

  if (config.cacheManagement?.enabled) {
    const cacheManager = new CacheManager({
      maxCacheSizeMB: config.cacheManagement?.maxCacheSizeMB || 600,
      cacheCheckIntervalMs:
        config.cacheManagement?.cacheCheckIntervalMs || 60 * 60 * 1000,
      partition: config.partition, // Pass partition config for dynamic cache paths
    });
    cacheManager.start();

    // Stop cache manager on app termination
    app.on("before-quit", () => {
      cacheManager.stop();
    });
  }

  // Initialize MQTT client if enabled
  if (config.mqtt?.enabled) {
    mqttClient = new MQTTClient(config);
    mqttClient.initialize();
  }

  mainAppWindow.onAppReady(appConfig, new CustomBackground(app, config), screenSharingService);

  // Initialize Graph API client if enabled (after mainAppWindow is ready)
  if (config.graphApi?.enabled) {
    graphApiClient = new GraphApiClient(config);
    const mainWindow = mainAppWindow.getWindow();
    if (mainWindow) {
      graphApiClient.initialize(mainWindow);
      console.debug("[GRAPH_API] Graph API client initialized with main window");
    } else {
      console.warn("[GRAPH_API] Main window not available, Graph API client not fully initialized");
    }
  }

  // Register Graph API IPC handlers (always register, handlers check for client availability)
  registerGraphApiHandlers(ipcMain, graphApiClient);

  // Register global shortcuts
  globalShortcuts.register(config, mainAppWindow, app);

  // Log IPC Security configuration status
  console.log('🔒 IPC Security: Channel allowlisting enabled');
  console.log(`🔒 IPC Security: ${allowedChannels.size} channels allowlisted`);
}

function handleCertificateError() {
  const arg = {
    event: arguments[0],
    webContents: arguments[1],
    url: arguments[2],
    error: arguments[3],
    certificate: arguments[4],
    callback: arguments[5],
    config: config,
  };
  certificateModule.onAppCertificateError(arg);
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
  console.debug(`User status changed to '${userStatus}'`);

  // Publish status to MQTT if enabled
  if (mqttClient) {
    await mqttClient.publishStatus(userStatus);
  }
}

async function setBadgeCountHandler(_event, count) {
  console.debug(`Badge count set to '${count}'`);
  app.setBadgeCount(count);
}

function handleGlobalShortcutDisabled() {
  config.disableGlobalShortcuts.map((shortcut) => {
    if (shortcut) {
      globalShortcut.register(shortcut, () => {
        console.debug(`Global shortcut ${shortcut} disabled`);
      });
    }
  });
}

function handleGlobalShortcutDisabledRevert() {
  config.disableGlobalShortcuts.map((shortcut) => {
    if (shortcut) {
      globalShortcut.unregister(shortcut);
      console.debug(`Global shortcut ${shortcut} unregistered`);
    }
  });
}

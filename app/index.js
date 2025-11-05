/**
 * app/index.js - Main entry point for Teams for Linux
 *
 * PHASE 1 MIGRATION: This file now uses the new Application architecture
 * while maintaining full backward compatibility with existing code.
 *
 * STRANGLER FIG PATTERN:
 * - New: Application class initialization with domain orchestration
 * - New: CompatibilityBridge for global state management
 * - Preserved: All existing IPC handlers and functionality
 * - Future: Gradually migrate logic to domains (Phase 2+)
 */

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  systemPreferences,
  powerMonitor,
  Notification,
  nativeImage,
} = require("electron");
const path = require("node:path");
const CustomBackground = require("./customBackground");
const { validateIpcChannel, allowedChannels } = require("./security/ipcValidator");
const ConfigurationDomain = require("./domains/configuration/ConfigurationDomain");
const os = require("node:os");
const isMac = os.platform() === "darwin";

// =============================================================================
// EARLY INITIALIZATION (Must happen before Application init)
// =============================================================================

// Support for E2E testing: use temporary userData directory for clean state
if (process.env.E2E_USER_DATA_DIR) {
  app.setPath("userData", process.env.E2E_USER_DATA_DIR);
}

// This must be executed before loading the config file.
ConfigurationDomain.initializeEarlyCommandSwitches();

// Load config file.
const { AppConfiguration } = require("./appConfiguration");
const appConfig = new AppConfiguration(
  app.getPath("userData"),
  app.getVersion()
);

const config = appConfig.startupConfig;
config.appPath = path.join(__dirname, app.isPackaged ? "../../" : "");

ConfigurationDomain.initializeCommandSwitches(config);

// =============================================================================
// NEW ARCHITECTURE: Application & Domain Initialization
// =============================================================================

const Application = require("./core/Application");
const CompatibilityBridge = require("./core/CompatibilityBridge");
const ConfigAdapter = require("./core/ConfigAdapter");

let application;
let bridge;

/**
 * Initialize the new Application architecture
 * This runs in parallel with legacy code during the transition
 */
async function initializeApplication() {
  try {
    // Wrap config in adapter to provide get/set methods expected by PluginAPI
    const configAdapter = new ConfigAdapter(config);

    // Create Application instance with domains
    application = new Application({
      config: configAdapter,
      logger: console,
      domains: ['infrastructure', 'configuration', 'shell', 'teams-integration']
    });

    // Initialize Application (loads and activates domains)
    await application.init();

    // Initialize compatibility bridge for global state
    bridge = new CompatibilityBridge(application, { logger: console });
    await bridge.init();

    // Store player reference in bridge for backward compatibility
    if (player) {
      bridge.setPlayer(player);
    }

    console.info('✓ New Application architecture initialized');
    console.info('✓ CompatibilityBridge active - global state managed via StateManager');
  } catch (error) {
    console.error('Failed to initialize Application architecture:', error);
    console.warn('Continuing with legacy code paths only');
  }
}

// =============================================================================
// LEGACY CODE: Notification Sounds & Player Setup
// TODO (Phase 2): Migrate to NotificationPlugin
// =============================================================================

const notificationSounds = [
  {
    type: "new-message",
    file: path.join(config.appPath, "assets/sounds/new_message.wav"),
  },
  {
    type: "meeting-started",
    file: path.join(config.appPath, "assets/sounds/meeting_started.wav"),
  },
];

let player;
try {
  const { NodeSound } = require("node-sound");
  player = NodeSound.getDefaultPlayer();
} catch (err) {
  console.warn(
    `No audio players found. Audio notifications might not work. ${err}`
  );
}

// =============================================================================
// LEGACY CODE: State Variables
// NOTE: These are now managed by StateManager via CompatibilityBridge
// Access via globalThis.userStatus, globalThis.idleTimeUserStatus, etc.
// =============================================================================

let userStatus = -1; // Kept for backward compatibility, bridges to StateManager
let idleTimeUserStatus = -1; // Kept for backward compatibility
let picker = null; // Screen picker window

// =============================================================================
// LEGACY CODE: Certificate & Core Modules
// TODO (Phase 3): Migrate to InfrastructureDomain
// =============================================================================

const certificateModule = require("./certificate");
const CacheManager = require("./cacheManager");
const gotTheLock = app.requestSingleInstanceLock();
const mainAppWindow = require("./mainAppWindow");

if (isMac) {
  requestMediaAccess();
}

const protocolClient = "msteams";
if (!app.isDefaultProtocolClient(protocolClient, process.execPath)) {
  app.setAsDefaultProtocolClient(protocolClient, process.execPath);
}

app.allowRendererProcessReuse = false;

// =============================================================================
// APP EVENT HANDLERS & IPC SECURITY
// =============================================================================

if (gotTheLock) {
  app.on("second-instance", mainAppWindow.onAppSecondInstance);
  app.on("ready", handleAppReady);
  app.on("quit", () => console.debug("quit"));
  app.on("render-process-gone", onRenderProcessGone);
  app.on("will-quit", () => {
    console.debug("will-quit");
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

  // =============================================================================
  // IPC HANDLERS
  // TODO (Phase 2): Migrate to appropriate domains via IPC bridge pattern
  // =============================================================================

  ipcMain.on("config-file-changed", restartApp);
  ipcMain.handle("get-config", async () => {
    return config;
  });
  ipcMain.handle("get-system-idle-state", handleGetSystemIdleState);
  ipcMain.handle("get-zoom-level", async (_event, name) => {
    // Delegate to ConfigurationDomain
    const configDomain = application.getDomain('configuration');
    return await configDomain.getZoomLevel(name);
  });
  ipcMain.handle("save-zoom-level", async (_event, args) => {
    // Delegate to ConfigurationDomain
    const configDomain = application.getDomain('configuration');
    await configDomain.saveZoomLevel(args);
  });
  ipcMain.handle("desktop-capturer-get-sources", (_event, opts) =>
    desktopCapturer.getSources(opts)
  );
  ipcMain.handle("choose-desktop-media", async (_event, sourceTypes) => {
    const sources = await desktopCapturer.getSources({ types: sourceTypes });
    const chosen = await showScreenPicker(sources);
    return chosen ? chosen.id : null;
  });

  ipcMain.on("cancel-desktop-media", () => {
    if (picker) {
      picker.close();
    }
  });
  ipcMain.handle("play-notification-sound", playNotificationSound);
  ipcMain.handle("show-notification", showNotification);
  ipcMain.handle("user-status-changed", userStatusChangedHandler);
  ipcMain.handle("set-badge-count", setBadgeCountHandler);
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

  // Navigation IPC handlers
  ipcMain.on("navigate-back", (event) => {
    const webContents = event.sender;
    if (webContents?.navigationHistory?.canGoBack()) {
      console.debug("Navigating back");
      webContents.navigationHistory.goBack();
    }
  });

  ipcMain.on("navigate-forward", (event) => {
    const webContents = event.sender;
    if (webContents?.navigationHistory?.canGoForward()) {
      console.debug("Navigating forward");
      webContents.navigationHistory.goForward();
    }
  });

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

// =============================================================================
// HELPER FUNCTIONS
// TODO (Phase 2-3): Migrate to appropriate domains
// =============================================================================

function restartApp() {
  console.info("Restarting app...");
  app.relaunch();
  app.exit();
}

async function showNotification(_event, options) {
  const startTime = Date.now();
  console.debug("[TRAY_DIAG] Native notification request received", {
    title: options.title,
    bodyLength: options.body?.length || 0,
    hasIcon: !!options.icon,
    type: options.type,
    urgency: config.defaultNotificationUrgency,
    timestamp: new Date().toISOString(),
    suggestion: "Monitor totalTimeMs for notification display delays"
  });

  try {
    playNotificationSound(null, {
      type: options.type,
      audio: "default",
      title: options.title,
      body: options.body,
    });

    const notification = new Notification({
      icon: nativeImage.createFromDataURL(options.icon),
      title: options.title,
      body: options.body,
      urgency: config.defaultNotificationUrgency,
    });

    notification.on("click", () => {
      console.debug("[TRAY_DIAG] Notification clicked, showing main window");
      mainAppWindow.show();
    });

    notification.show();

    const totalTime = Date.now() - startTime;
    console.debug("[TRAY_DIAG] Native notification displayed successfully", {
      title: options.title,
      totalTimeMs: totalTime,
      urgency: config.defaultNotificationUrgency,
      performanceNote: totalTime > 500 ? "Slow notification display detected" : "Normal notification speed"
    });

  } catch (error) {
    console.error("[TRAY_DIAG] Failed to show native notification", {
      error: error.message,
      title: options.title,
      elapsedMs: Date.now() - startTime,
      suggestion: "Check if notification permissions are granted or icon data is valid"
    });
  }
}

async function playNotificationSound(_event, options) {
  console.debug(
    `Notification => Type: ${options.type}, Audio: ${options.audio}, Title: ${options.title}, Body: ${options.body}`
  );
  // Player failed to load or notification sound disabled in config
  if (!player || config.disableNotificationSound) {
    console.debug("Notification sounds are disabled");
    return;
  }
  // Notification sound disabled if not available set in config and user status is not "Available" (or is unknown)
  if (
    config.disableNotificationSoundIfNotAvailable &&
    userStatus !== 1 &&
    userStatus !== -1
  ) {
    console.debug("Notification sounds are disabled when user is not active");
    return;
  }
  const sound = notificationSounds.find((ns) => {
    return ns.type === options.type;
  });

  if (sound) {
    console.debug(`Playing file: ${sound.file}`);
    await player.play(sound.file);
    return;
  }

  console.debug("No notification sound played", player, options);
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

async function handleAppReady() {
  // Initialize new Application architecture
  await initializeApplication();

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

  mainAppWindow.onAppReady(appConfig, new CustomBackground(app, config));

  // Log IPC Security configuration status
  console.log('🔒 IPC Security: Channel allowlisting enabled');
  console.log(`🔒 IPC Security: ${allowedChannels.size} channels allowlisted`);
}

async function handleGetSystemIdleState() {
  const systemIdleState = powerMonitor.getSystemIdleState(
    config.appIdleTimeout
  );

  if (systemIdleState !== "active" && idleTimeUserStatus == -1) {
    console.debug(
      `GetSystemIdleState => IdleTimeout: ${
        config.appIdleTimeout
      }s, IdleTimeoutPollInterval: ${
        config.appIdleTimeoutCheckInterval
      }s, ActiveCheckPollInterval: ${
        config.appActiveCheckInterval
      }s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${systemIdleState}'`
    );
    idleTimeUserStatus = userStatus;
  }

  const state = {
    system: systemIdleState,
    userIdle: idleTimeUserStatus,
    userCurrent: userStatus,
  };

  if (systemIdleState === "active") {
    console.debug(
      `GetSystemIdleState => IdleTimeout: ${
        config.appIdleTimeout
      }s, IdleTimeoutPollInterval: ${
        config.appIdleTimeoutCheckInterval
      }s, ActiveCheckPollInterval: ${
        config.appActiveCheckInterval
      }s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${systemIdleState}'`
    );
    idleTimeUserStatus = -1;
  }

  return state;
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

  // Update StateManager if bridge is available
  if (bridge) {
    bridge.getStateManager().setUserStatus(userStatus);
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

function showScreenPicker(sources) {
  return new Promise((resolve) => {
    picker = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, "screenPicker", "preload.js"),
      },
    });

    picker.loadFile(path.join(__dirname, "screenPicker", "index.html"));

    picker.webContents.on("did-finish-load", () => {
      picker.webContents.send("sources-list", sources);
    });

    ipcMain.once("source-selected", (event, source) => {
      resolve(source);
      if (picker) {
        picker.close();
      }
    });

    picker.on("closed", () => {
      picker = null;
      resolve(null);
    });
  });
}

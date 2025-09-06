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
const path = require("path");
const CustomBackground = require("./customBackground");
const { validateIpcChannel, allowedChannels } = require("./security/ipcValidator");
const os = require("os");
const isMac = os.platform() === "darwin";

// This must be executed before loading the config file.
addCommandLineSwitchesBeforeConfigLoad();

// Load config file.
const { AppConfiguration } = require("./appConfiguration");
const appConfig = new AppConfiguration(
  app.getPath("userData"),
  app.getVersion()
);

const config = appConfig.startupConfig;
config.appPath = path.join(__dirname, !app.isPackaged ? "" : "../../");

addCommandLineSwitchesAfterConfigLoad();

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

let userStatus = -1;
let idleTimeUserStatus = -1;
let picker = null;

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

if (isMac) {
  requestMediaAccess();
}

const protocolClient = "msteams";
if (!app.isDefaultProtocolClient(protocolClient, process.execPath)) {
  app.setAsDefaultProtocolClient(protocolClient, process.execPath);
}

app.allowRendererProcessReuse = false;

if (!gotTheLock) {
  console.info("App already running");
  app.quit();
} else {
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

  ipcMain.on("config-file-changed", restartApp);
  ipcMain.handle("get-config", async () => {
    return config;
  });
  ipcMain.handle("get-system-idle-state", handleGetSystemIdleState);
  ipcMain.handle("get-zoom-level", handleGetZoomLevel);
  ipcMain.handle("save-zoom-level", handleSaveZoomLevel);
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
  ipcMain.on("screen-sharing-stopped", () => {
    global.selectedScreenShareSource = null;

    // Close preview window when screen sharing stops
    if (global.previewWindow && !global.previewWindow.isDestroyed()) {
      global.previewWindow.close();
    }
  });

  // Preview window management IPC handlers
  ipcMain.handle("get-screen-sharing-status", () => {
    return global.selectedScreenShareSource !== null;
  });

  ipcMain.handle("get-screen-share-stream", () => {
    // Return the source ID - handle both string and object formats
    if (typeof global.selectedScreenShareSource === "string") {
      return global.selectedScreenShareSource;
    } else if (global.selectedScreenShareSource?.id) {
      return global.selectedScreenShareSource.id;
    }
    return null;
  });

  ipcMain.handle("get-screen-share-screen", () => {
    // Return screen dimensions if available from StreamSelector, otherwise default
    if (
      global.selectedScreenShareSource &&
      typeof global.selectedScreenShareSource === "object"
    ) {
      const { screen } = require("electron");
      const displays = screen.getAllDisplays();

      if (global.selectedScreenShareSource?.id?.startsWith("screen:")) {
        const display = displays[0] || { size: { width: 1920, height: 1080 } };
        return { width: display.size.width, height: display.size.height };
      }
    }

    return { width: 1920, height: 1080 };
  });

  ipcMain.on("resize-preview-window", (event, { width, height }) => {
    if (global.previewWindow && !global.previewWindow.isDestroyed()) {
      const [minWidth, minHeight] = global.previewWindow.getMinimumSize();
      const newWidth = Math.max(minWidth, Math.min(width, 480));
      const newHeight = Math.max(minHeight, Math.min(height, 360));
      global.previewWindow.setSize(newWidth, newHeight);
      global.previewWindow.center();
    }
  });

  ipcMain.on("stop-screen-sharing-from-thumbnail", () => {
    global.selectedScreenShareSource = null;
    if (global.previewWindow && !global.previewWindow.isDestroyed()) {
      global.previewWindow.webContents.send("screen-sharing-status-changed");
    }
  });
}

function restartApp() {
  console.info("Restarting app...");
  app.relaunch();
  app.exit();
}

/**
 * Applies critical Electron command line switches that must be set before config loading.
 * These switches affect core Electron behavior and cannot be changed after app initialization.
 */
function addCommandLineSwitchesBeforeConfigLoad() {
  app.commandLine.appendSwitch("try-supported-channel-layouts");

  // Disabled features
  const disabledFeatures = app.commandLine.hasSwitch("disable-features")
    ? app.commandLine.getSwitchValue("disable-features").split(",")
    : ["HardwareMediaKeyHandling"];

  // Prevent hardware media keys from interfering with Teams' built-in media controls
  // This ensures Teams' own play/pause buttons work correctly instead of conflicting
  // with system-level media key handling
  if (!disabledFeatures.includes("HardwareMediaKeyHandling"))
    disabledFeatures.push("HardwareMediaKeyHandling");

  app.commandLine.appendSwitch("disable-features", disabledFeatures.join(","));
}

/**
 * Applies configuration-dependent command line switches after config is loaded.
 * Handles environment-specific optimizations (Wayland) and user preferences.
 */
function addCommandLineSwitchesAfterConfigLoad() {
  // Wayland-specific optimization for Linux desktop environments
  // PipeWire provides better screen sharing and audio capture on Wayland
  if (process.env.XDG_SESSION_TYPE === "wayland") {
    console.info("Running under Wayland, disabling GPU composition and switching to PipeWire...");
    config.disableGpu = true;

    const features = app.commandLine.hasSwitch("enable-features")
      ? app.commandLine.getSwitchValue("enable-features").split(",")
      : [];
    if (!features.includes("WebRTCPipeWireCapturer"))
      features.push("WebRTCPipeWireCapturer");

    app.commandLine.appendSwitch("enable-features", features.join(","));
    app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
  }

  // Proxy
  if (config.proxyServer) {
    app.commandLine.appendSwitch("proxy-server", config.proxyServer);
  }

  if (config.class) {
    console.info("Setting WM_CLASS property to custom value " + config.class);
    app.setName(config.class);
  }

  app.commandLine.appendSwitch(
    "auth-server-whitelist",
    config.authServerWhitelist
  );

  // GPU
  if (config.disableGpu) {
    console.info("Disabling GPU support...");
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-compositing");
    app.commandLine.appendSwitch("disable-software-rasterizer");
    app.disableHardwareAcceleration();
  }

  addElectronCLIFlagsFromConfig();
}

function addElectronCLIFlagsFromConfig() {
  if (Array.isArray(config.electronCLIFlags)) {
    for (const flag of config.electronCLIFlags) {
      if (typeof flag === "string") {
        console.debug(`Adding electron CLI flag '${flag}'`);
        app.commandLine.appendSwitch(flag);
      } else if (Array.isArray(flag) && typeof flag[0] === "string") {
        if (
          !(
            typeof flag[1] === "undefined" ||
            typeof flag[1] === "object" ||
            typeof flag[1] === "function"
          )
        ) {
          console.debug(
            `Adding electron CLI flag '${flag[0]}' with value '${flag[1]}'`
          );
          app.commandLine.appendSwitch(flag[0], flag[1]);
        } else {
          console.debug(`Adding electron CLI flag '${flag[0]}'`);
          app.commandLine.appendSwitch(flag[0]);
        }
      }
    }
  }
}

//TODO: Refator this area (move up or group)
async function showNotification(_event, options) {
  console.debug("Showing notification using electron API");

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

  notification.on("click", mainAppWindow.show);

  notification.show();
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
  const sound = notificationSounds.filter((ns) => {
    return ns.type === options.type;
  })[0];

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

  if (config.cacheManagement?.enabled === true) {
    const cacheManager = new CacheManager({
      maxCacheSizeMB: config.cacheManagement?.maxCacheSizeMB || 300,
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
    ...{
      system: systemIdleState,
      userIdle: idleTimeUserStatus,
      userCurrent: userStatus,
    },
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

//TODO:Consider moving partitions to another module (maybe with the handle zooom level)
async function handleGetZoomLevel(_, name) {
  const partition = getPartition(name) || {};
  return partition.zoomLevel ? partition.zoomLevel : 0;
}

async function handleSaveZoomLevel(_, args) {
  let partition = getPartition(args.partition) || {};
  partition.name = args.partition;
  partition.zoomLevel = args.zoomLevel;
  savePartition(partition);
}

function getPartitions() {
  return appConfig.settingsStore.get("app.partitions") || [];
}

function getPartition(name) {
  const partitions = getPartitions();
  return partitions.filter((p) => {
    return p.name === name;
  })[0];
}

function savePartition(arg) {
  const partitions = getPartitions();
  const partitionIndex = partitions.findIndex((p) => {
    return p.name === arg.name;
  });

  if (partitionIndex >= 0) {
    partitions[partitionIndex] = arg;
  } else {
    partitions.push(arg);
  }
  appConfig.settingsStore.set("app.partitions", partitions);
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
  ["camera", "microphone"].forEach(async (permission) => {
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
  });
}

async function userStatusChangedHandler(_event, options) {
  userStatus = options.data.status;
  console.debug(`User status changed to '${userStatus}'`);
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

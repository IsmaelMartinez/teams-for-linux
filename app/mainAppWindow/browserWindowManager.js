const {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  powerSaveBlocker,
} = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const windowStateKeeper = require("electron-window-state");
const { StreamSelector } = require("../screenSharing");
const TrayIconChooser = require("../browser/tools/trayIconChooser");
const IncomingCallToast = require("../incomingCallToast");
const {
  collectPartitionsToClear,
  clearStorageForPartitions,
} = require("../utils/storagePartitions");

const MIN_WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 300;
// Height of the min/max/close overlay drawn over the Teams top bar. It matches
// the Teams header so the buttons sit inside it rather than below it.
const TITLE_BAR_OVERLAY_HEIGHT = 48;

class BrowserWindowManager {
  constructor(properties) {
    this.config = properties.config;
    this.iconChooser = properties.iconChooser;
    // Optional: only the startup clear reads it.
    this.profilesManager = properties.profilesManager ?? null;
    this.isOnCall = false;
    this.blockerId = null;
    this.window = null;
    this.incomingCallCommandProcess = null;
    this.incomingCallToast = null;
    this.hasIncomingCall = false;
    this.incomingCallWebContents = null;
  }

  /**
   * Get screen lock inhibition method from config.
   * @returns {string} "Electron" or "WakeLockSentinel"
   */
  get screenLockInhibitionMethod() {
    return this.config?.screenSharing?.lockInhibitionMethod ?? "Electron";
  }

  async createWindow() {
    const windowState = windowStateKeeper({
      defaultWidth: 0,
      defaultHeight: 0,
    });

    if (this.config.clearStorageData) {
      // Every profile owns its own partition, so clearing only the startup one
      // left each profile's cookies and tokens on disk (#2866).
      await clearStorageForPartitions(
        collectPartitionsToClear(this.config.partition, this.profilesManager),
        this.config.clearStorageData,
        "on startup"
      );
    }

    this.window = this.createNewBrowserWindow(windowState);
    this.assignEventHandlers();

    windowState.manage(this.window);

    if (process.env.E2E_TESTING !== 'true') {
      this.window.eval = globalThis.eval = function () {
        throw new Error("Sorry, this app does not support window.eval().");
      };
    }

    this.incomingCallToast = new IncomingCallToast((action) => {
      this.window.webContents.send("incoming-call-action", action);
    });

    return this.window;
  }

  /**
   * Converts an icon path to a nativeImage.
   * On Linux/KDE, the BrowserWindow icon must be a nativeImage for proper
   * display in the window list/panel (similar to tray icon fix in #2096).
   * @param {string} iconPath - Path to the icon file
   * @returns {Electron.NativeImage|undefined} The native image or undefined if no path
   */
  getIconImage(iconPath) {
    return iconPath ? TrayIconChooser.windowImage(iconPath) : undefined;
  }

  /**
   * Window decoration options for `window.hideTitleBar` (Linux only).
   *
   * `titleBarStyle: "hidden"` keeps the native frame, so Chromium still draws
   * the rounded corners, shadow and resize borders, but drops the title bar.
   * `titleBarOverlay` puts the window buttons back over the Teams top bar.
   * `window.frame: false` wins: a frameless window has nothing to hide.
   * @returns {object} BrowserWindow options, empty when the option is off
   */
  getTitleBarOptions() {
    if (
      process.platform !== "linux" ||
      !this.config.window?.hideTitleBar ||
      this.config.frame === false
    ) {
      return {};
    }
    const dark = nativeTheme.shouldUseDarkColors;
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: dark ? "#1f1f1f" : "#ebebeb",
        symbolColor: dark ? "#ffffff" : "#242424",
        height: TITLE_BAR_OVERLAY_HEIGHT,
      },
    };
  }

  createNewBrowserWindow(windowState) {
    return new BrowserWindow({
      title: "Teams for Linux",
      x: windowState.x,
      y: windowState.y,

      width: windowState.width,
      height: windowState.height,
      // electron-window-state accepts any positive size, so a window that was
      // saved at 1x1 came back at 1x1 with no edge left to drag (#2996).
      // Electron clamps both the restored size and later resizes to these.
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#302a75" : "#fff",

      show: false,
      autoHideMenuBar: this.config.menubar === "auto",
      icon: this.iconChooser ? this.getIconImage(this.iconChooser.getFile()) : undefined,
      frame: this.config.frame,
      ...this.getTitleBarOptions(),

      webPreferences: {
        partition: this.config.partition,
        preload: path.join(__dirname, "..", "browser", "preload.js"),
        plugins: true,
        spellcheck: true,
        webviewTag: false,
        // SECURITY: Disabled for Teams DOM access, compensated by IPC validation
        contextIsolation: false,  // Required for ReactHandler DOM access
        nodeIntegration: false,   // Secure: preload scripts don't need this
        sandbox: false,           // Required for system API access
      },
    });
  }

  assignEventHandlers() {
    // Handle screen sharing source selection from user
    ipcMain.on("select-source", this.assignSelectSourceHandler());
    if (this.screenLockInhibitionMethod === "WakeLockSentinel") {
      // Wake Lock auto-releases when document.visibilityState becomes 'hidden',
      // which happens on both minimise and tray-hide. Re-acquire on both events.
      const reAcquireWakeLock = this.enableWakeLockOnWindowRestore.bind(this);
      this.window.on("restore", reAcquireWakeLock);
      this.window.on("show", reAcquireWakeLock);
    }
    // Handle incoming call notification created
    ipcMain.handle(
      "incoming-call-created",
      this.assignOnIncomingCallCreatedHandler()
    );
    // Handle incoming call notification ended
    ipcMain.handle(
      "incoming-call-ended",
      this.assignOnIncomingCallEndedHandler()
    );
    // Notify when a call is connected
    ipcMain.handle("call-connected", this.assignOnCallConnectedHandler());
    // Notify when a call is disconnected
    ipcMain.handle("call-disconnected", this.assignOnCallDisconnectedHandler());
  }

  assignSelectSourceHandler() {
    return (event) => {
      const streamSelector = new StreamSelector(this.window);
      streamSelector.show((source) => {
        event.reply("select-source", source);
      });
    };
  }

  disableScreenLockElectron() {
    if (this.blockerId == null) {
      this.blockerId = powerSaveBlocker.start("prevent-display-sleep");
      console.debug(
        `Power save is disabled using ${this.screenLockInhibitionMethod} API.`
      );
      return true;
    }
    return false;
  }

  disableScreenLockWakeLockSentinel() {
    this.window.webContents.send("enable-wakelock");
    console.debug(
      `Power save is disabled using ${this.screenLockInhibitionMethod} API.`
    );
    return true;
  }

  enableScreenLockElectron() {
    if (this.blockerId != null && powerSaveBlocker.isStarted(this.blockerId)) {
      console.debug(
        `Power save is restored using ${this.screenLockInhibitionMethod} API`
      );
      powerSaveBlocker.stop(this.blockerId);
      this.blockerId = null;
      return true;
    }
    return false;
  }

  enableScreenLockWakeLockSentinel() {
    this.window.webContents.send("disable-wakelock");
    console.debug(
      `Power save is restored using ${this.screenLockInhibitionMethod} API`
    );
    return true;
  }

  enableWakeLockOnWindowRestore() {
    if (this.isOnCall) {
      this.window.webContents.send("enable-wakelock");
    }
  }

  /**
   * Sanitizes a string argument for use in spawn() command arguments.
   * Ensures the value is a string and limits its length to prevent abuse.
   */
  sanitizeCommandArg(value) {
    if (typeof value !== 'string') return '';
    // Limit argument length, then keep only letters, numbers, marks, spaces and
    // punctuation. This drops control characters and shell metacharacters
    // (backticks, $, |, ~, ^, =, +, <, >) in case the configured command is a
    // shell script that mishandles its arguments.
    const trimmed = value.substring(0, 500);
    return trimmed.replaceAll(/[^\p{L}\p{N}\p{M}\p{Zs}\p{P}]/gu, '');
  }

  assignOnIncomingCallCreatedHandler() {
    return async (e, data) => {
      this.hasIncomingCall = true;
      this.incomingCallWebContents = e?.sender ?? null;
      if (this.config.incomingCallCommand) {
        this.handleOnIncomingCallEnded();
        const commandArgs = [
          ...this.config.incomingCallCommandArgs,
          this.sanitizeCommandArg(data.caller),
          this.sanitizeCommandArg(data.text),
          this.sanitizeCommandArg(data.image),
        ];
        this.incomingCallCommandProcess = spawn(
          this.config.incomingCallCommand,
          commandArgs
        );
        this.incomingCallCommandProcess.on('error', (err) => {
          console.error('[IncomingCall] Failed to execute incoming call command', { code: err.code });
          this.incomingCallCommandProcess = null;
        });
      }
      if (this.config.enableIncomingCallToast) {
        this.incomingCallToast.show(data);
      }
      app.emit('teams-incoming-call-started', data?.details);
    };
  }

  assignOnIncomingCallEndedHandler() {
    return async (e) => {
      if (this.incomingCallWebContents && e?.sender !== this.incomingCallWebContents) return;
      this.hasIncomingCall = false;
      this.incomingCallWebContents = null;
      this.handleOnIncomingCallEnded();
      app.emit('teams-incoming-call-ended');
    };
  }

  performIncomingCallAction(action) {
    if (!["ACCEPT_AUDIO", "ACCEPT_VIDEO", "DECLINE"].includes(action) || !this.hasIncomingCall) return false;
    try {
      let target = this.incomingCallWebContents;
      if (!target) target = this.window?.webContents;
      if (!target || target.isDestroyed()) return false;
      target.send("incoming-call-action", action);
      return true;
    } catch (error) {
      console.warn("[IncomingCall] Failed to dispatch call action", { message: error.message });
      return false;
    }
  }

  handleOnIncomingCallEnded() {
    if (this.incomingCallCommandProcess) {
      this.incomingCallCommandProcess.kill("SIGTERM");
      this.incomingCallCommandProcess = null;
    }
    if (this.config.enableIncomingCallToast) {
      this.incomingCallToast.hide();
    }
  }

  assignOnCallConnectedHandler() {
    return async (event) => {
      this.isOnCall = true;
      const result = this.screenLockInhibitionMethod === "Electron"
        ? this.disableScreenLockElectron()
        : this.disableScreenLockWakeLockSentinel();

      app.emit('teams-call-connected', event?.sender ?? null);
      return result;
    };
  }

  assignOnCallDisconnectedHandler() {
    return async (event) => {
      this.isOnCall = false;
      const result = this.screenLockInhibitionMethod === "Electron"
        ? this.enableScreenLockElectron()
        : this.enableScreenLockWakeLockSentinel();

      app.emit('teams-call-disconnected', event?.sender ?? null);
      return result;
    };
  }
}

module.exports = BrowserWindowManager;

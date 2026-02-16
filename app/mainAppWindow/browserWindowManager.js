const {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  session,
  nativeTheme,
  powerSaveBlocker,
} = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const windowStateKeeper = require("electron-window-state");
const { StreamSelector } = require("../screenSharing");
const IncomingCallToast = require("../incomingCallToast");

class BrowserWindowManager {
  constructor(properties) {
    this.config = properties.config;
    this.iconChooser = properties.iconChooser;
    this.isOnCall = false;
    this.blockerId = null;
    this.window = null;
    this.incomingCallCommandProcess = null;
    this.incomingCallToast = null;
  }

  /**
   * Get screen lock inhibition method from config.
   * Supports both new (screenSharing.lockInhibitionMethod) and legacy (screenLockInhibitionMethod) paths.
   * @returns {string} "Electron" or "WakeLockSentinel"
   */
  get screenLockInhibitionMethod() {
    return this.config?.screenSharing?.lockInhibitionMethod ??
           this.config?.screenLockInhibitionMethod ??
           "Electron";
  }

  async createWindow() {
    // Load the previous state with fallback to defaults
    const windowState = windowStateKeeper({
      defaultWidth: 0,
      defaultHeight: 0,
    });

    if (this.config.clearStorageData) {
      console.debug("Clearing storage data", this.config.clearStorageData);
      const defSession = session.fromPartition(this.config.partition);
      await defSession.clearStorageData(this.config.clearStorageData);
    }

    // Create the window
    this.window = this.createNewBrowserWindow(windowState);
    this.assignEventHandlers();

    windowState.manage(this.window);

    this.window.eval = globalThis.eval = function () {
      // eslint-disable-line no-eval
      throw new Error("Sorry, this app does not support window.eval().");
    };

    this.incomingCallToast = new IncomingCallToast((action) => {
      this.window.webContents.send("incoming-call-action", action);
    });

    return this.window;
  }

  /**
   * Apply Content Security Policy headers to response details for Teams domains.
   * CSP acts as a compensating control for disabled contextIsolation/sandbox.
   * Teams requires 'unsafe-eval' and 'unsafe-inline' in script-src because its
   * bundled JavaScript uses eval() and inline scripts for core functionality.
   *
   * @param {Object} details - The request details from onHeadersReceived
   * @returns {Object} Modified response headers with CSP, or original headers if not a Teams domain
   */
  static applyContentSecurityPolicy(details) {
    const teamsOrigins = [
      'https://teams.cloud.microsoft',
      'https://teams.microsoft.com',
      'https://teams.live.com',
      'https://outlook.office.com',
      'https://login.microsoftonline.com'
    ];

    // CDN domains used by Teams for static assets, scripts, and Fluent UI icons
    // Issue #2121: Missing office.net domain was causing icon registration failures
    const teamsCdnDomains = [
      'https://*.office.com',
      'https://*.office.net',           // statics.teams.cdn.office.net - Fluent UI icons
      'https://*.microsoftonline.com',
      'https://*.sharepoint.com',
      'https://*.static.microsoft'      // res.public.onecdn.static.microsoft
    ];

    const isTeamsDomain = teamsOrigins.some(origin => details.url.startsWith(origin));

    if (isTeamsDomain) {
      return {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            `default-src 'self' ${teamsOrigins.join(' ')} ${teamsCdnDomains.join(' ')};`,
            `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${teamsOrigins.join(' ')} ${teamsCdnDomains.join(' ')};`,
            `style-src 'self' 'unsafe-inline' ${teamsOrigins.join(' ')} ${teamsCdnDomains.join(' ')};`,
            "img-src 'self' data: blob: https: http:;",
            "media-src 'self' blob: https: mediastream:;",
            "connect-src 'self' wss: https: blob:;",
            `font-src 'self' data: ${teamsOrigins.join(' ')} ${teamsCdnDomains.join(' ')};`,
            "object-src 'none';",
            "base-uri 'self';",
            `form-action 'self' ${teamsOrigins.join(' ')} ${teamsCdnDomains.join(' ')};`,
            "frame-ancestors 'none';"
          ].join(' ')
        ]
      };
    }

    return details.responseHeaders;
  }

  /**
   * Converts an icon path to a nativeImage.
   * On Linux/KDE, the BrowserWindow icon must be a nativeImage for proper
   * display in the window list/panel (similar to tray icon fix in #2096).
   * @param {string} iconPath - Path to the icon file
   * @returns {Electron.NativeImage|undefined} The native image or undefined if no path
   */
  getIconImage(iconPath) {
    return iconPath ? nativeImage.createFromPath(iconPath) : undefined;
  }

  createNewBrowserWindow(windowState) {
    return new BrowserWindow({
      title: "Teams for Linux",
      x: windowState.x,
      y: windowState.y,

      width: windowState.width,
      height: windowState.height,
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#302a75" : "#fff",

      show: false,
      autoHideMenuBar: this.config.menubar == "auto",
      icon: this.iconChooser ? this.getIconImage(this.iconChooser.getFile()) : undefined,
      frame: this.config.frame,

      webPreferences: {
        partition: this.config.partition,
        preload: path.join(__dirname, "..", "browser", "preload.js"),
        plugins: true,
        spellcheck: true,
        webviewTag: true,
        // SECURITY: Disabled for Teams DOM access, compensated by CSP + IPC validation
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
      this.window.on("restore", this.enableWakeLockOnWindowRestore);
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

  assignOnIncomingCallCreatedHandler() {
    return async (e, data) => {
      if (this.config.incomingCallCommand) {
        this.handleOnIncomingCallEnded();
        const commandArgs = [
          ...this.config.incomingCallCommandArgs,
          data.caller,
          data.text,
          data.image,
        ];
        this.incomingCallCommandProcess = spawn(
          this.config.incomingCallCommand,
          commandArgs
        );
      }
      if (this.config.enableIncomingCallToast) {
        this.incomingCallToast.show(data);
      }
    };
  }

  assignOnIncomingCallEndedHandler() {
    return async (e) => {
      this.handleOnIncomingCallEnded();
    };
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
    return async (e) => {
      this.isOnCall = true;
      const result = this.screenLockInhibitionMethod === "Electron"
        ? this.disableScreenLockElectron()
        : this.disableScreenLockWakeLockSentinel();

      app.emit('teams-call-connected');
      return result;
    };
  }

  assignOnCallDisconnectedHandler() {
    return async (e) => {
      this.isOnCall = false;
      const result = this.screenLockInhibitionMethod === "Electron"
        ? this.enableScreenLockElectron()
        : this.enableScreenLockWakeLockSentinel();

      app.emit('teams-call-disconnected');
      return result;
    };
  }
}

module.exports = BrowserWindowManager;

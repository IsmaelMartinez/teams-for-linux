const {
  BrowserWindow,
  ipcMain,
  session,
  nativeTheme,
  powerSaveBlocker,
} = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const windowStateKeeper = require("electron-window-state");
const { StreamSelector } = require("../streamSelector");
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

    this.window.eval = global.eval = function () {
      // eslint-disable-line no-eval
      throw new Error("Sorry, this app does not support window.eval().");
    };

    this.incomingCallToast = new IncomingCallToast((action) => {
      this.window.webContents.send("incoming-call-action", action);
    });

    return this.window;
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
      icon: this.iconChooser ? this.iconChooser.getFile() : undefined,
      frame: this.config.frame,

      webPreferences: {
        partition: this.config.partition,
        preload: path.join(__dirname, "..", "browser", "preload.js"),
        plugins: true,
        spellcheck: true,
        webviewTag: true,
      },
    });
  }

  assignEventHandlers() {
    ipcMain.on("select-source", this.assignSelectSourceHandler());
    if (this.config.screenLockInhibitionMethod === "WakeLockSentinel") {
      this.window.on("restore", this.enableWakeLockOnWindowRestore);
    }
    ipcMain.handle(
      "incoming-call-created",
      this.assignOnIncomingCallCreatedHandler()
    );
    ipcMain.handle(
      "incoming-call-ended",
      this.assignOnIncomingCallEndedHandler()
    );
    ipcMain.handle("call-connected", this.assignOnCallConnectedHandler());
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
        `Power save is disabled using ${this.config.screenLockInhibitionMethod} API.`
      );
      return true;
    }
    return false;
  }

  disableScreenLockWakeLockSentinel() {
    this.window.webContents.send("enable-wakelock");
    console.debug(
      `Power save is disabled using ${this.config.screenLockInhibitionMethod} API.`
    );
    return true;
  }

  enableScreenLockElectron() {
    if (this.blockerId != null && powerSaveBlocker.isStarted(this.blockerId)) {
      console.debug(
        `Power save is restored using ${this.config.screenLockInhibitionMethod} API`
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
      `Power save is restored using ${this.config.screenLockInhibitionMethod} API`
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
      return this.config.screenLockInhibitionMethod === "Electron"
        ? this.disableScreenLockElectron()
        : this.disableScreenLockWakeLockSentinel();
    };
  }

  assignOnCallDisconnectedHandler() {
    return async (e) => {
      this.isOnCall = false;
      return this.config.screenLockInhibitionMethod === "Electron"
        ? this.enableScreenLockElectron()
        : this.enableScreenLockWakeLockSentinel();
    };
  }
}

module.exports = BrowserWindowManager;

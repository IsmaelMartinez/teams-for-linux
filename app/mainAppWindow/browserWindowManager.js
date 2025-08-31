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
const { StreamSelector } = require("../screenSharing");
const IncomingCallToast = require("../incomingCallToast");
const SecureTokenExtractor = require("../secureTokenExtractor");

class BrowserWindowManager {
  constructor(properties) {
    this.config = properties.config;
    this.iconChooser = properties.iconChooser;
    this.isOnCall = false;
    this.blockerId = null;
    this.window = null;
    this.incomingCallCommandProcess = null;
    this.incomingCallToast = null;
    
    // Initialize secure token extractor for Graph API access
    this.tokenExtractor = new SecureTokenExtractor(this.config.partition);
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

    // Apply Content Security Policy as compensating control for disabled security features
    this.setupContentSecurityPolicy();

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

    // Initialize secure token extraction after window is ready
    this.window.webContents.once('dom-ready', () => {
      this.initializeSecureTokenExtraction();
    });

    return this.window;
  }

  setupContentSecurityPolicy() {
    // Content Security Policy as compensating control for disabled contextIsolation/sandbox
    // This helps mitigate some security risks while maintaining Teams DOM access functionality
    const webSession = session.fromPartition(this.config.partition);
    
    webSession.webRequest.onHeadersReceived((details, callback) => {
      // Only apply CSP to Teams domains, not to all requests
      const teamsOrigins = [
        'https://teams.microsoft.com',
        'https://teams.live.com',
        'https://outlook.office.com',
        'https://login.microsoftonline.com'
      ];
      
      const isTeamsDomain = teamsOrigins.some(origin => details.url.startsWith(origin));
      
      if (isTeamsDomain) {
        const responseHeaders = {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            // Allow Teams functionality while restricting dangerous operations
            "default-src 'self' https://teams.microsoft.com https://teams.live.com https://outlook.office.com https://login.microsoftonline.com https://*.office.com https://*.sharepoint.com https://*.microsoftonline.com; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://teams.microsoft.com https://teams.live.com https://*.office.com https://*.microsoftonline.com; " +
            "style-src 'self' 'unsafe-inline' https://teams.microsoft.com https://teams.live.com https://*.office.com; " +
            "img-src 'self' data: blob: https: http:; " +
            "media-src 'self' blob: https: mediastream:; " +
            "connect-src 'self' wss: https: blob:; " +
            "font-src 'self' data: https://teams.microsoft.com https://*.office.com; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self' https://login.microsoftonline.com https://*.office.com; " +
            "frame-ancestors 'none';"
          ]
        };
        
        callback({ responseHeaders });
      } else {
        callback({});
      }
    });
    
    console.debug("Content Security Policy configured as compensating control for disabled security features");
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
        // SECURITY CONFIGURATION: Required for Teams DOM access
        // CRITICAL: Disabling these security features to enable ReactHandler functionality
        // This is temporary until API fallback is available (v3.0) before React 19 breaks DOM access (Q4 2025)
        contextIsolation: false,  // DISABLED: Required for DOM access to Teams React internals
        nodeIntegration: true,    // ENABLED: Required for browser tools functionality  
        sandbox: false,           // DISABLED: Required for direct system API access
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
    
    // Graph API handlers for secure backend integration
    ipcMain.handle("graph-api-request", this.assignGraphApiHandler());
    ipcMain.handle("graph-test-connection", this.assignGraphTestHandler());
    ipcMain.handle("graph-calendar-events", this.assignGraphCalendarHandler());
    ipcMain.handle("graph-mail-messages", this.assignGraphMailHandler());
    ipcMain.handle("graph-token-status", this.assignGraphTokenStatusHandler());
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

  // ============== SECURE TOKEN EXTRACTION & GRAPH API METHODS ==============

  /**
   * Initialize secure token extraction system
   * This runs in the main process without requiring DOM access
   */
  async initializeSecureTokenExtraction() {
    try {
      console.log('BrowserWindowManager: Initializing secure token extraction...');
      
      // Start periodic token refresh
      this.tokenExtractor.startTokenRefresh(5); // Every 5 minutes
      
      // Test initial token extraction
      setTimeout(async () => {
        const testResult = await this.tokenExtractor.testGraphConnection();
        if (testResult) {
          console.log('BrowserWindowManager: ✅ Secure Graph API access established');
          
          // Notify renderer that backend API is available
          this.window.webContents.send('graph-api-ready', {
            available: true,
            timestamp: new Date().toISOString()
          });
        } else {
          console.log('BrowserWindowManager: ⚠️  Graph API access not available, using DOM fallback');
          
          // Notify renderer to continue with DOM-based approach
          this.window.webContents.send('graph-api-ready', {
            available: false,
            fallbackToDom: true,
            timestamp: new Date().toISOString()
          });
        }
      }, 3000); // Wait 3 seconds for Teams to load
      
    } catch (error) {
      console.error('BrowserWindowManager: Error initializing token extraction:', error);
    }
  }

  /**
   * Handle Graph API requests from renderer
   */
  assignGraphApiHandler() {
    return async (event, endpoint, options = {}) => {
      try {
        console.debug(`BrowserWindowManager: Graph API request: ${endpoint}`);
        const result = await this.tokenExtractor.makeGraphApiRequest(endpoint, options);
        return result;
      } catch (error) {
        console.error('BrowserWindowManager: Graph API request error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    };
  }

  /**
   * Handle Graph API connection test requests
   */
  assignGraphTestHandler() {
    return async (event) => {
      try {
        console.debug('BrowserWindowManager: Testing Graph API connection...');
        const result = await this.tokenExtractor.testGraphConnection();
        return {
          success: result,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('BrowserWindowManager: Graph test error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    };
  }

  /**
   * Handle calendar events requests
   */
  assignGraphCalendarHandler() {
    return async (event, daysAhead = 1) => {
      try {
        console.debug(`BrowserWindowManager: Getting calendar events for next ${daysAhead} days`);
        const result = await this.tokenExtractor.getUserCalendarEvents(daysAhead);
        return result;
      } catch (error) {
        console.error('BrowserWindowManager: Calendar request error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    };
  }

  /**
   * Handle mail messages requests
   */
  assignGraphMailHandler() {
    return async (event, maxResults = 10) => {
      try {
        console.debug(`BrowserWindowManager: Getting ${maxResults} mail messages`);
        const result = await this.tokenExtractor.getUserMailMessages(maxResults);
        return result;
      } catch (error) {
        console.error('BrowserWindowManager: Mail request error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    };
  }

  /**
   * Handle token status requests
   */
  assignGraphTokenStatusHandler() {
    return async (event) => {
      try {
        console.debug('BrowserWindowManager: Getting token status');
        const status = this.tokenExtractor.getStatus();
        return {
          success: true,
          status: status
        };
      } catch (error) {
        console.error('BrowserWindowManager: Token status error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    };
  }

  /**
   * Clean up token extraction resources
   */
  cleanupTokenExtraction() {
    if (this.tokenExtractor) {
      this.tokenExtractor.stopTokenRefresh();
      this.tokenExtractor.clearTokenCache();
      console.debug('BrowserWindowManager: Token extraction resources cleaned up');
    }
  }
}

module.exports = BrowserWindowManager;

const { ipcMain, net, powerMonitor } = require("electron");

let _ConnectionManager_window = new WeakMap();
let _ConnectionManager_config = new WeakMap();
let _ConnectionManager_currentUrl = new WeakMap();
let _ConnectionManager_isRefreshing = new WeakMap();
let _ConnectionManager_refreshTimeout = new WeakMap();
let _ConnectionManager_boundRefresh = new WeakMap();
let _ConnectionManager_boundDidFailLoad = new WeakMap();

class ConnectionManager {
  get window() {
    return _ConnectionManager_window.get(this);
  }

  get config() {
    return _ConnectionManager_config.get(this);
  }

  get currentUrl() {
    return _ConnectionManager_currentUrl.get(this);
  }

  start(url, options) {
    // Cleanup existing listeners before updating properties
    // This ensures we clean up the old window's listeners, not the new one's
    this.cleanup();

    _ConnectionManager_window.set(this, options.window);
    _ConnectionManager_config.set(this, options.config);
    _ConnectionManager_currentUrl.set(this, url || this.config.url);
    _ConnectionManager_isRefreshing.set(this, false);
    _ConnectionManager_refreshTimeout.set(this, null);

    // Bind methods to preserve 'this' context
    const boundRefresh = this.debouncedRefresh.bind(this);
    const boundDidFailLoad = assignOnDidFailLoadEventHandler(this);
    _ConnectionManager_boundRefresh.set(this, boundRefresh);
    _ConnectionManager_boundDidFailLoad.set(this, boundDidFailLoad);

    // Retry connection when user clicks retry button on offline page
    ipcMain.on("offline-retry", boundRefresh);
    powerMonitor.on("resume", boundRefresh);
    this.window.webContents.on("did-fail-load", boundDidFailLoad);

    this.refresh();
  }

  cleanup() {
    const boundRefresh = _ConnectionManager_boundRefresh.get(this);
    const boundDidFailLoad = _ConnectionManager_boundDidFailLoad.get(this);

    if (boundRefresh) {
      ipcMain.removeListener("offline-retry", boundRefresh);
      powerMonitor.removeListener("resume", boundRefresh);
    }

    if (boundDidFailLoad && this.isWindowAvailable() && this.window.webContents) {
      this.window.webContents.removeListener("did-fail-load", boundDidFailLoad);
    }

    // Clear any pending debounce timeout
    const timeout = _ConnectionManager_refreshTimeout.get(this);
    if (timeout) {
      clearTimeout(timeout);
      _ConnectionManager_refreshTimeout.set(this, null);
    }
  }

  debouncedRefresh() {
    // Clear any existing timeout
    const existingTimeout = _ConnectionManager_refreshTimeout.get(this);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set a new timeout to debounce rapid network change events
    const timeout = setTimeout(() => {
      _ConnectionManager_refreshTimeout.set(this, null);
      this.refresh();
    }, 1000); // Wait 1 second before actually refreshing

    _ConnectionManager_refreshTimeout.set(this, timeout);
  }

  isWindowAvailable() {
    return this.window && !this.window.isDestroyed();
  }

  async refresh() {
    if (!this.isWindowAvailable()) {
      console.warn("Window is not available. Cannot refresh.");
      return;
    }

    // Prevent concurrent refresh operations
    const isRefreshing = _ConnectionManager_isRefreshing.get(this);
    if (isRefreshing) {
      console.debug("Refresh already in progress, skipping...");
      return;
    }

    try {
      _ConnectionManager_isRefreshing.set(this, true);

      const currentUrl = this.window?.webContents?.getURL() || "";
      const hasUrl = currentUrl?.startsWith("https://");
      this.window?.setTitle("Waiting for network...");
      console.debug("Waiting for network...");
      const connected = await this.isOnline();

      // Re-check window availability after async isOnline() call,
      // as the window may have been destroyed during the network check
      if (!this.isWindowAvailable()) {
        console.warn("[CONNECTION] Window was destroyed during network check. Aborting refresh.");
        return;
      }

      if (connected) {
        if (hasUrl) {
          console.debug("Reloading current page...");
          try {
            this.window.reload();
          } catch (err) {
            console.error(`[CONNECTION] Failed to reload page: ${err.message}`);
            this.debouncedRefresh();
          }
        } else {
          console.debug("Loading initial URL...");
          try {
            await this.window.loadURL(this.currentUrl, {
              userAgent: this.config.chromeUserAgent,
            });
          } catch (err) {
            console.error(`[CONNECTION] Failed to load URL: ${err.message}`);
            this.debouncedRefresh();
          }
        }
      } else {
        this.window?.setTitle("No internet connection");
        console.error("No internet connection");
      }
    } finally {
      _ConnectionManager_isRefreshing.set(this, false);
    }
  }

  async isOnline() {
    const testUrl = this.config.url;
    const testDomain = new URL(testUrl).hostname;

    // Helper: retry a check up to `tries` times, reject if all fail
    const withRetries = (fn, tries) => async () => {
      for (let i = 0; i < tries; i++) {
        if (await fn()) return true;
        if (i < tries - 1) await sleep(500);
      }
      throw new Error("offline");
    };

    try {
      // Run all three checks in parallel — first to succeed wins
      return await Promise.any([
        withRetries(() => isOnlineHttps(testUrl), 3)(),
        withRetries(() => isOnlineDns(testDomain), 3)(),
        withRetries(() => Promise.resolve(net.isOnline()), 3)(),
      ]);
    } catch {
      // All checks failed — escape hatch: assume online to avoid blocking startup
      console.warn("[CONNECTION] All network checks failed, assuming online.");
      return true;
    }
  }
}

const { NETWORK_ERROR_PATTERNS } = require("../config/defaults");

// Network errors that should trigger an automatic reconnection attempt.
// These cover disconnections, network changes, and proxy/tunnel failures.
const RECOVERABLE_NETWORK_ERRORS = new Set(NETWORK_ERROR_PATTERNS);

function assignOnDidFailLoadEventHandler(cm) {
  return (event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      console.error(`[CONNECTION] Main frame failed to load: ${description} (code: ${code})`);
      if (RECOVERABLE_NETWORK_ERRORS.has(description)) {
        console.debug(`Network error detected: ${description}, scheduling debounced refresh...`);
        cm.debouncedRefresh();
      }
    } else {
      console.warn(`[CONNECTION] Sub-frame failed to load: ${description} (code: ${code})`);
    }
  };
}

function sleep(timeout) {
  return new Promise((r) => setTimeout(r, timeout));
}

function isOnlineHttps(testUrl) {
  return new Promise((resolve) => {
    const req = net.request({
      url: testUrl,
      method: "HEAD",
    });
    const timer = setTimeout(() => resolve(false), 5000);
    req.on("response", () => { clearTimeout(timer); resolve(true); });
    req.on("error", () => { clearTimeout(timer); resolve(false); });
    req.end();
  });
}

function isOnlineDns(testDomain) {
  return new Promise((resolve) => {
    net
      .resolveHost(testDomain)
      .then(() => resolve(true))
      .catch(() => resolve(false));
  });
}

module.exports = ConnectionManager;

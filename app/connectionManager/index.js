const { ipcMain, net, powerMonitor } = require("electron");

// Debounce window for rapid network change events before refreshing
const REFRESH_DEBOUNCE_MS = 1000;

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
    const existingTimeout = _ConnectionManager_refreshTimeout.get(this);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      _ConnectionManager_refreshTimeout.set(this, null);
      this.refresh();
    }, REFRESH_DEBOUNCE_MS);

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
    const onlineCheckMethods = [
      {
        // Perform an actual HTTPS request, similar to loading the Teams app.
        method: "https",
        tries: 10,
        networkTest: async () => {
          return await isOnlineHttps(this.config.url);
        },
      },
      {
        // Sometimes too optimistic, might be false-positive where an HTTP proxy is
        // mandatory but not reachable yet.
        method: "dns",
        tries: 5,
        networkTest: async () => {
          const testDomain = new URL(this.config.url).hostname;
          return await isOnlineDns(testDomain);
        },
      },
      {
        // Sounds good but be careful, too optimistic in my experience; and at the contrary,
        // might also be false negative where no DNS is available for internet domains, but
        // an HTTP proxy is actually available and working.
        method: "native",
        tries: 5,
        networkTest: async () => {
          return net.isOnline();
        },
      },
      {
        // That's more an escape gate in case all methods are broken, it disables
        // the network test (assumes we're online).
        method: "none",
        tries: 1,
        networkTest: async () => {
          console.warn("Network test is disabled, assuming online.");
          return true;
        },
      },
    ];

    for (const onlineCheckMethod of onlineCheckMethods) {
      for (let i = 1; i <= onlineCheckMethod.tries; i++) {
        const online = await onlineCheckMethod.networkTest();
        if (online) {
          return true;
        }
        await sleep(500);
      }
    }
    return false;
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
      // Sub-frame failures are expected in restricted networks (e.g. Teams
      // telemetry iframes blocked, Loop endpoints unreachable). Not
      // actionable for end users; keep at debug for diagnosis when needed.
      console.debug(`[CONNECTION] Sub-frame failed to load: ${description} (code: ${code})`);
    }
  };
}

function sleep(timeout) {
  return new Promise((r) => setTimeout(r, timeout));
}

// Electron's net.request / net.resolveHost have no application-level timeout. A
// stale socket left over from system suspend can leave a probe pending without
// ever firing 'response' or 'error', which wedges the whole connectivity check:
// the awaited refresh() never settles, its `finally` never clears the
// isRefreshing guard, and every subsequent retry is skipped, so the app sits on
// "Waiting for network..." until it is killed (#2611). Bound each probe so it
// always settles; a timed-out probe resolves false and isOnline() falls through
// to the next method (and the retry loop gives a recovering network time).
const PROBE_TIMEOUT_MS = 5000;

// Bound a connectivity probe so it always settles. run(finish) performs the
// probe and calls the idempotent finish(true|false) when it resolves; finish
// also clears the timeout. If the probe has not settled within PROBE_TIMEOUT_MS,
// the optional cleanup returned by run() runs (e.g. abort an in-flight request)
// and the probe resolves false. A synchronous throw from run() (net.request on a
// malformed URL, a net-stack init failure) is treated as offline, so the probe
// always resolves a boolean and isOnline() falls through rather than rejecting
// and wedging refresh().
function probeWithTimeout(run) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let cleanup;
    const finish = (online) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(online);
    };
    timer = setTimeout(() => {
      try {
        cleanup?.();
      } catch {
        /* nothing to clean up, or request already settled */
      }
      finish(false);
    }, PROBE_TIMEOUT_MS);
    try {
      cleanup = run(finish);
    } catch {
      finish(false);
    }
  });
}

function isOnlineHttps(testUrl) {
  return probeWithTimeout((finish) => {
    const req = net.request({ url: testUrl, method: "HEAD" });
    req.on("response", () => finish(true));
    req.on("error", () => finish(false));
    req.end();
    // On timeout, abort the in-flight request before resolving false.
    return () => req.abort();
  });
}

function isOnlineDns(testDomain) {
  return probeWithTimeout((finish) => {
    net
      .resolveHost(testDomain)
      .then(() => finish(true))
      .catch(() => finish(false));
  });
}

module.exports = ConnectionManager;

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

    if (boundDidFailLoad && this.window?.webContents) {
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

  async refresh() {
    if (!this.window) {
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
      if (connected) {
        if (hasUrl) {
          console.debug("Reloading current page...");
          this.window.reload();
        } else {
          console.debug("Loading initial URL...");
          this.window.loadURL(this.currentUrl, {
            userAgent: this.config.chromeUserAgent,
          });
        }
      } else {
        this.window.setTitle("No internet connection");
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
          console.debug(
            "Testing network using net.request() for " + this.config.url
          );
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
          console.debug(
            "Testing network using net.resolveHost() for " + testDomain
          );
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
          console.debug("Testing network using net.isOnline()");
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
          console.debug(
            "Network test successful with method " + onlineCheckMethod.method
          );
          return true;
        }
        await sleep(500);
      }
    }
    return false;
  }
}

function assignOnDidFailLoadEventHandler(cm) {
  return (event, code, description) => {
    console.error(
      `assignOnDidFailLoadEventHandler : ${JSON.stringify(
        event
      )} - ${code} - ${description}`
    );
    if (
      description === "ERR_INTERNET_DISCONNECTED" ||
      description === "ERR_NETWORK_CHANGED"
    ) {
      console.debug(`Network error detected: ${description}, scheduling debounced refresh...`);
      cm.debouncedRefresh();
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
    req.on("response", () => {
      resolve(true);
    });
    req.on("error", () => {
      resolve(false);
    });
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

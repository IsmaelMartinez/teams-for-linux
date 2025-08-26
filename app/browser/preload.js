const { contextBridge, ipcRenderer, webFrame } = require("electron");

// Expose APIs needed by browser scripts with contextIsolation
contextBridge.exposeInMainWorld("electronAPI", {
  desktopCapture: {
    chooseDesktopMedia: (sources, cb) => {
      ipcRenderer
        .invoke("choose-desktop-media", sources)
        .then((streamId) => cb(streamId));
      return Date.now();
    },
    cancelChooseDesktopMedia: () => ipcRenderer.send("cancel-desktop-media"),
  },
  // Screen sharing events
  sendScreenSharingStarted: (sourceId) =>
    ipcRenderer.send("screen-sharing-started", sourceId),
  sendScreenSharingStopped: () => ipcRenderer.send("screen-sharing-stopped"),
  stopSharing: () => ipcRenderer.send("stop-screen-sharing-from-thumbnail"),
  sendSelectSource: () => ipcRenderer.send("select-source"),
  onSelectSource: (callback) => ipcRenderer.once("select-source", callback),
  send: (channel, ...args) => {
    // Allow sending specific IPC events
    if (
      [
        "active-screen-share-stream",
        "screen-sharing-stopped",
        "screen-sharing-started",
      ].includes(channel)
    ) {
      return ipcRenderer.send(channel, ...args);
    }
  },

  // Configuration
  getConfig: () => ipcRenderer.invoke("get-config"),

  // Notifications
  showNotification: (options) =>
    ipcRenderer.invoke("show-notification", options),
  playNotificationSound: (options) =>
    ipcRenderer.invoke("play-notification-sound", options),

  // Badge count
  setBadgeCount: (count) => ipcRenderer.invoke("set-badge-count", count),

  // Tray icon
  updateTray: (icon, flash) => ipcRenderer.send("tray-update", icon, flash),

  // Theme events
  onSystemThemeChanged: (callback) =>
    ipcRenderer.on("system-theme-changed", callback),

  // User status
  setUserStatus: (data) => ipcRenderer.invoke("user-status-changed", data),

  // Zoom
  getZoomLevel: (partition) => ipcRenderer.invoke("get-zoom-level", partition),
  saveZoomLevel: (data) => ipcRenderer.invoke("save-zoom-level", data),
  webFrame: {
    setZoomLevel: (level) => webFrame.setZoomLevel(level),
    getZoomLevel: () => webFrame.getZoomLevel(),
  },

  // System information (safe to expose)
  sessionType: process.env.XDG_SESSION_TYPE || "x11",
});

// Initialize browser modules after DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Preload: DOMContentLoaded, initializing browser modules...");
  try {
    const config = await ipcRenderer.invoke("get-config");
    console.log("Preload: Got config:", {
      trayIconEnabled: config?.trayIconEnabled,
      useMutationTitleLogic: config?.useMutationTitleLogic,
      emulateWinChromiumPlatform: config?.emulateWinChromiumPlatform,
      followSystemTheme: config?.followSystemTheme,
    });

    // Initialize title monitoring directly in preload
    if (config.useMutationTitleLogic) {
      console.debug("Preload: MutationObserverTitle enabled");
      const observer = new MutationObserver(() => {
        console.debug(`title changed to ${document.title}`);
        const regex = /^\((\d+)\)/;
        const match = regex.exec(document.title);
        const number = match ? parseInt(match[1]) : 0;
        const event = new CustomEvent("unread-count", {
          detail: { number: number },
        });
        window.dispatchEvent(event);
      });
      observer.observe(document.querySelector("title"), {
        childList: true,
      });
    }

    // Initialize tray icon functionality directly in preload
    if (config.trayIconEnabled) {
      console.debug("Preload: tray icon is enabled");
      window.addEventListener("unread-count", (event) => {
        const count = event.detail.number;
        console.debug("sending tray-update");
        ipcRenderer.send("tray-update", {
          icon: null, // Let main process handle icon rendering
          flash: count > 0 && !config.disableNotificationWindowFlash,
          count: count,
        });
        ipcRenderer.invoke("set-badge-count", count);
      });
    }

    console.log("Preload: Essential tray modules initialized successfully");

    // Initialize platform emulation inline
    if (config.emulateWinChromiumPlatform) {
      console.debug(
        "Preload: Platform emulation enabled, setting up Windows emulation"
      );
      try {
        // Update platform property in navigator
        const win32Str = "Win32";
        const windowsStr = "Windows";
        Object.defineProperty(Navigator.prototype, "platform", {
          get: () => {
            return win32Str;
          },
        });

        // Update userAgentData object
        let originalUserAgentData = navigator.userAgentData;
        let customUserAgentData = JSON.parse(
          JSON.stringify(originalUserAgentData)
        );
        customUserAgentData = {
          ...customUserAgentData,
          platform: windowsStr,
          getHighEntropyValues: async function (input) {
            let highEntropyValue =
              await originalUserAgentData.getHighEntropyValues(input);
            if (highEntropyValue["platform"]) {
              highEntropyValue["platform"] = windowsStr;
            }
            return highEntropyValue;
          },
        };
        Object.defineProperty(Navigator.prototype, "userAgentData", {
          get: () => {
            return customUserAgentData;
          },
        });

        console.debug(
          "Preload: Platform emulation configured successfully - navigator.platform:",
          navigator.platform
        );
      } catch (err) {
        console.error(
          "Preload: Failed to initialize platform emulation:",
          err.message
        );
      }
    } else {
      console.debug("Preload: Platform emulation disabled in configuration");
    }

    // Initialize zoom functionality inline
    console.debug("Preload: Initializing zoom functionality inline");
    try {
      // Zoom configuration constants
      const zoomFactor = 0.25;
      const zoomMin = -7.5; // -7.5 * 20% = -150% or 50% of original
      const zoomMax = 7.5; // 7.5 * 20% = +200% or 300% of original
      const zoomOffsets = {
        "+": 1,
        "-": -1,
        0: 0,
      };

      // Restore saved zoom level
      async function restoreZoomLevel() {
        try {
          console.debug("Preload: Restoring zoom level from storage");
          const zoomLevel = await ipcRenderer.invoke("get-zoom-level", config.partition);
          webFrame.setZoomLevel(zoomLevel);
          console.debug(`Preload: Zoom level restored to ${zoomLevel}`);
        } catch (err) {
          console.error("Preload: Failed to restore zoom level:", err.message);
        }
      }

      // Set zoom level with bounds checking and persistence
      function setNextZoomLevel(keyName) {
        try {
          const zoomOffset = zoomOffsets[keyName];
          let zoomLevel = webFrame.getZoomLevel();
          console.debug(`Preload: Current zoom level: ${zoomLevel}`);
          
          if (typeof zoomOffset !== "number") {
            console.debug("Preload: Invalid zoom offset:", keyName);
            return;
          }

          zoomLevel = zoomOffset === 0 ? 0 : zoomLevel + zoomOffset * zoomFactor;
          if (zoomLevel < zoomMin || zoomLevel > zoomMax) {
            console.debug(`Preload: Zoom level ${zoomLevel} outside bounds [${zoomMin}, ${zoomMax}]`);
            return;
          }
          
          webFrame.setZoomLevel(zoomLevel);
          console.debug(`Preload: Zoom level set to ${zoomLevel}`);
          
          // Save zoom level
          ipcRenderer.invoke("save-zoom-level", {
            partition: config.partition,
            zoomLevel: webFrame.getZoomLevel(),
          }).catch(err => {
            console.error("Preload: Failed to save zoom level:", err.message);
          });
        } catch (err) {
          console.error("Preload: Failed to set zoom level:", err.message);
        }
      }

      // Expose zoom functions globally for access by other scripts
      window.zoomControls = {
        restoreZoomLevel,
        resetZoomLevel: () => setNextZoomLevel("0"),
        increaseZoomLevel: () => setNextZoomLevel("+"),
        decreaseZoomLevel: () => setNextZoomLevel("-"),
      };

      // Restore zoom level on initialization
      await restoreZoomLevel();
      
      console.debug("Preload: Zoom functionality initialized successfully");
    } catch (err) {
      console.error("Preload: Failed to initialize zoom functionality:", err.message);
    }

    // Initialize ReactHandler functionality inline
    console.debug("Preload: Initializing ReactHandler functionality inline");
    try {
      // ReactHandler class functionality for Teams React integration
      const reactHandler = {
        getCommandChangeReportingService() {
          try {
            const teams2CoreServices = this._getTeams2CoreServices();
            return teams2CoreServices?.commandChangeReportingService;
          } catch (err) {
            console.error("Preload: Failed to get CommandChangeReportingService:", err.message);
            return null;
          }
        },

        getTeams2IdleTracker() {
          try {
            const teams2CoreServices = this._getTeams2CoreServices();
            return teams2CoreServices?.clientState?._idleTracker;
          } catch (err) {
            console.error("Preload: Failed to get Teams2IdleTracker:", err.message);
            return null;
          }
        },

        getTeams2ClientPreferences() {
          try {
            const teams2CoreServices = this._getTeams2CoreServices();
            return teams2CoreServices?.clientPreferences?.clientPreferences;
          } catch (err) {
            console.error("Preload: Failed to get Teams2ClientPreferences:", err.message);
            return null;
          }
        },

        _getTeams2ReactElement() {
          try {
            const element = document.getElementById("app");
            if (!element) {
              console.debug("Preload: Teams app element not found");
              return null;
            }
            return element;
          } catch (err) {
            console.error("Preload: Failed to get Teams2ReactElement:", err.message);
            return null;
          }
        },

        _getTeams2CoreServices() {
          try {
            const reactElement = this._getTeams2ReactElement();
            if (!reactElement) {
              return null;
            }

            const internalRoot =
              reactElement._reactRootContainer?._internalRoot ||
              reactElement._reactRootContainer;
            
            if (!internalRoot) {
              console.debug("Preload: React internal root not found");
              return null;
            }

            const coreServices = internalRoot.current?.updateQueue?.baseState?.element?.props?.coreServices;
            if (!coreServices) {
              console.debug("Preload: Teams core services not available");
              return null;
            }

            return coreServices;
          } catch (err) {
            console.error("Preload: Failed to access Teams2CoreServices:", err.message);
            return null;
          }
        }
      };

      // Expose ReactHandler globally for access by other scripts
      window.reactHandler = reactHandler;
      
      console.debug("Preload: ReactHandler functionality initialized successfully");
    } catch (err) {
      console.error("Preload: Failed to initialize ReactHandler functionality:", err.message);
    }

    // Initialize theme management functionality inline
    if (config.followSystemTheme) {
      console.debug("Preload: Theme management enabled, initializing system theme sync");
      try {
        // Apply theme function
        async function applyTheme(isDark) {
          try {
            const theme = isDark ? "dark" : "default";
            console.debug(`Preload: Applying theme: ${theme}`);
            
            const clientPreferences = window.reactHandler?.getTeams2ClientPreferences();
            if (clientPreferences) {
              console.debug("Preload: Using React to set the theme");
              clientPreferences.theme.userTheme = theme;
              console.debug(`Preload: Theme changed to ${theme}`);
            } else {
              console.debug("Preload: Teams client preferences not available for theme setting");
            }
          } catch (err) {
            console.error("Preload: Failed to apply theme:", err.message);
          }
        }

        // Set initial theme preference using ReactHandler
        const clientPreferences = window.reactHandler?.getTeams2ClientPreferences();
        if (clientPreferences) {
          console.debug("Preload: Using React to set the follow system theme preference");
          clientPreferences.theme.followOsTheme = config.followSystemTheme;
          console.debug("Preload: Follow system theme preference set to:", config.followSystemTheme);
        } else {
          console.debug("Preload: Teams client preferences not available, will retry when DOM is ready");
        }

        // Listen for system theme changes
        ipcRenderer.on("system-theme-changed", (event, isDark) => {
          console.debug("Preload: System theme changed, isDark:", isDark);
          applyTheme(isDark);
        });

        console.debug("Preload: Theme management initialized successfully");
      } catch (err) {
        console.error("Preload: Failed to initialize theme management:", err.message);
      }
    } else {
      console.debug("Preload: Theme management disabled in configuration");
    }

    // Initialize keyboard shortcuts functionality inline
    console.debug("Preload: Initializing keyboard shortcuts functionality inline");
    try {
      // Platform detection for shortcuts
      const isMac = navigator.platform.toLowerCase().includes('mac');
      console.debug("Preload: Platform detected for shortcuts:", isMac ? "Mac" : "Non-Mac");

      // Key mappings with zoom integration
      const keyMaps = {
        "CTRL_+": () => window.zoomControls?.increaseZoomLevel(),
        "CTRL_=": () => window.zoomControls?.increaseZoomLevel(),
        "CTRL_-": () => window.zoomControls?.decreaseZoomLevel(),
        "CTRL__": () => window.zoomControls?.decreaseZoomLevel(),
        "CTRL_0": () => window.zoomControls?.resetZoomLevel(),
        // Alt (Option) Left / Right is used to jump words in Mac, so disabling the history navigation for Mac
        ...(!isMac
          ? {
              "ALT_ArrowLeft": () => {
                console.debug("Preload: Navigating back");
                window.history.back();
              },
              "ALT_ArrowRight": () => {
                console.debug("Preload: Navigating forward");
                window.history.forward();
              },
            }
          : {}),
      };

      // Event handlers
      function keyDownEventHandler(event) {
        const keyName = event.key;
        if (keyName === "Control" || keyName === "Alt") {
          return;
        }
        fireEvent(event, keyName);
      }

      function wheelEventHandler(event) {
        if (event.ctrlKey) {
          event.preventDefault();
          console.debug("Preload: Ctrl+scroll zoom detected, deltaY:", event.deltaY);
          if (event.deltaY > 0) {
            window.zoomControls?.decreaseZoomLevel();
          } else if (event.deltaY < 0) {
            window.zoomControls?.increaseZoomLevel();
          }
        }
      }

      function getKeyName(event, keyName) {
        return `${event.ctrlKey ? "CTRL_" : ""}${event.altKey ? "ALT_" : ""}${keyName}`;
      }

      function fireEvent(event, keyName) {
        const handler = keyMaps[getKeyName(event, keyName)];
        if (typeof handler === "function") {
          console.debug("Preload: Firing keyboard shortcut:", getKeyName(event, keyName));
          event.preventDefault();
          handler();
        }
      }

      // Add event listeners to window
      function addEventListeners() {
        console.debug("Preload: Adding keyboard shortcuts event listeners");
        window.addEventListener("keydown", keyDownEventHandler, false);
        window.addEventListener("wheel", wheelEventHandler, { passive: false });
        
        // Also add listeners to iframe when it's ready
        whenIframeReady((iframe) => {
          console.debug("Preload: Adding keyboard shortcuts to Teams iframe");
          iframe.contentDocument.addEventListener("keydown", keyDownEventHandler, false);
          iframe.contentDocument.addEventListener("wheel", wheelEventHandler, { passive: false });
        });
      }

      function whenIframeReady(callback) {
        const iframe = window.document.getElementsByTagName("iframe")[0];
        if (iframe) {
          callback(iframe);
        } else {
          setTimeout(() => whenIframeReady(callback), 1000);
        }
      }

      function whenWindowReady(callback) {
        if (window) {
          callback();
        } else {
          setTimeout(() => whenWindowReady(callback), 1000);
        }
      }

      // Initialize shortcuts when window is ready
      whenWindowReady(addEventListeners);
      
      console.debug("Preload: Keyboard shortcuts functionality initialized successfully");
    } catch (err) {
      console.error("Preload: Failed to initialize keyboard shortcuts:", err.message);
    }

    // Initialize other modules safely
    const modules = [
      { name: "settings", path: "./tools/settings" },
      { name: "timestampCopyOverride", path: "./tools/timestampCopyOverride" },
    ];

    let successCount = 0;
    modules.forEach((module) => {
      try {
        const moduleInstance = require(module.path);
        if (module.name === "settings" || module.name === "theme") {
          moduleInstance.init(config, ipcRenderer);
        } else {
          moduleInstance.init(config);
        }
        successCount++;
      } catch (err) {
        console.error(`Preload: Failed to load ${module.name}:`, err.message);
      }
    });

    console.log(
      `Preload: ${successCount}/${modules.length} browser modules initialized successfully`
    );

    // Initialize ActivityManager
    try {
      const ActivityManager = require("./notifications/activityManager");
      new ActivityManager(ipcRenderer, config).start();
    } catch (err) {
      console.error(
        "Preload: ActivityManager failed to initialize:",
        err.message
      );
    }
  } catch (error) {
    console.error("Preload: Failed to initialize browser modules:", error);
  }
});

// Forward unhandled promise rejections and window errors to main for diagnostics
try {
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event && event.reason;
      ipcRenderer.send("unhandled-rejection", {
        message: reason && reason.message ? reason.message : String(reason),
        stack: reason && reason.stack ? reason.stack : null,
        // Keep the raw reason only when it's a plain object to avoid huge payloads
        reason: typeof reason === "object" && reason !== null ? reason : null,
      });
    } catch (err) {
      console.debug("Unhandled rejection forwarding failed:", err);
      // Best-effort forwarding, never throw from preload
    }
  });

  window.addEventListener("error", (event) => {
    try {
      ipcRenderer.send("window-error", {
        message: event && event.message,
        filename: event && event.filename,
        lineno: event && event.lineno,
        colno: event && event.colno,
        errorStack:
          event && event.error && event.error.stack ? event.error.stack : null,
      });
    } catch (err) {
      console.debug("Window error forwarding failed:", err);
    }
  });
} catch (err) {
  console.debug("Error handler setup failed:", err);
}

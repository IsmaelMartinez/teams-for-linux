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
    
    // Centralized React readiness detection (module-level scope for accessibility)
    let reactReady = false;
    let reactReadyCallbacks = [];
    let cachedCoreServices = null;
    
    function waitForReactReady(callback) {
        if (reactReady) {
          callback();
        } else {
          reactReadyCallbacks.push(callback);
        }
      }
      
    function checkReactReadiness() {
        try {
          const reactElement = document.getElementById("app");
          if (!reactElement) {
            return false;
          }

          const internalRoot =
            reactElement._reactRootContainer?._internalRoot ||
            reactElement._reactRootContainer;
          
          if (!internalRoot) {
            return false;
          }

          const coreServices = internalRoot.current?.updateQueue?.baseState?.element?.props?.coreServices;
          if (!coreServices) {
            return false;
          }

          // React is ready! Cache the core services
          if (!reactReady) {
            console.debug("Preload: Teams React is ready, caching core services and initializing React-dependent functionality");
            cachedCoreServices = coreServices;
            reactReady = true;
            // Execute all waiting callbacks
            reactReadyCallbacks.forEach(callback => {
              try {
                callback();
              } catch (err) {
                console.error("Preload: Error in React ready callback:", err.message);
              }
            });
            reactReadyCallbacks = [];
          }
          return true;
        } catch (err) {
          console.error("Preload: Error checking React readiness:", err.message);
          return false;
        }
      }
      
    // Start React readiness polling
    const reactReadinessInterval = setInterval(() => {
      if (checkReactReadiness()) {
        clearInterval(reactReadinessInterval);
        console.debug("Preload: React readiness polling stopped - Teams React is ready");
      }
    }, 2000); // Check every 2 seconds
      
    try {
      // ReactHandler class functionality for Teams React integration
      
      const reactHandler = {
        getCommandChangeReportingService() {
          if (!reactReady || !cachedCoreServices) {
            return null;
          }
          return cachedCoreServices.commandChangeReportingService;
        },

        getTeams2IdleTracker() {
          if (!reactReady || !cachedCoreServices) {
            return null;
          }
          return cachedCoreServices.clientState?._idleTracker;
        },

        getTeams2ClientPreferences() {
          if (!reactReady || !cachedCoreServices) {
            return null;
          }
          return cachedCoreServices.clientPreferences?.clientPreferences;
        },

        _getTeams2ReactElement() {
          return document.getElementById("app");
        },

        _getTeams2CoreServices() {
          if (!reactReady || !cachedCoreServices) {
            return null;
          }
          return cachedCoreServices;
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
          if (iframe.contentDocument) {
            iframe.contentDocument.addEventListener("keydown", keyDownEventHandler, false);
            iframe.contentDocument.addEventListener("wheel", wheelEventHandler, { passive: false });
          } else {
            console.debug("Preload: iframe.contentDocument not available, skipping iframe shortcuts");
          }
        });
      }

      function whenIframeReady(callback) {
        const iframe = window.document.getElementsByTagName("iframe")[0];
        if (iframe && iframe.contentDocument) {
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

    // Initialize settings management functionality inline
    console.debug("Preload: Initializing settings management functionality inline");
    try {
      // Settings retrieval function
      async function retrieveTeamsSettings(event) {
        try {
          console.debug("Preload: Retrieving Teams settings from React");
          const clientPreferences = window.reactHandler?.getTeams2ClientPreferences();

          if (!clientPreferences) {
            console.error("Preload: Failed to retrieve Teams settings from React");
            return;
          }

          const settings = {
            theme: clientPreferences.theme.userTheme,
            chatDensity: clientPreferences.density.chatDensity,
          };
          console.debug("Preload: Retrieved Teams settings:", settings);
          event.sender.send("get-teams-settings", settings);
        } catch (err) {
          console.error("Preload: Failed to retrieve Teams settings:", err.message);
        }
      }

      // Settings restore function
      async function restoreTeamsSettings(event, ...args) {
        try {
          console.debug("Preload: Restoring Teams settings:", args[0]);
          const clientPreferences = window.reactHandler?.getTeams2ClientPreferences();

          if (!clientPreferences) {
            console.warn("Preload: Failed to retrieve Teams settings from React for restore");
            return;
          }

          clientPreferences.theme.userTheme = args[0].theme;
          clientPreferences.density.chatDensity = args[0].chatDensity;
          console.debug("Preload: Teams settings restored successfully");
          event.sender.send("set-teams-settings", true);
        } catch (err) {
          console.error("Preload: Failed to restore Teams settings:", err.message);
        }
      }

      // Register IPC handlers for settings
      ipcRenderer.on("get-teams-settings", retrieveTeamsSettings);
      ipcRenderer.on("set-teams-settings", restoreTeamsSettings);

      console.debug("Preload: Settings management initialized successfully");
    } catch (err) {
      console.error("Preload: Failed to initialize settings management:", err.message);
    }

    // Initialize timestamp copy override functionality inline (wait for React readiness)
    if (config.disableTimestampOnCopy !== undefined) {
      // Module-level variables for proper lifecycle management
      let timestampOverrideInterval = null;
      let timestampOverrideInitialized = false;

      function applyTimestampOverride() {
        try {
          if (!reactReady || !cachedCoreServices?.coreSettings) {
            console.debug("Preload: Core services not available for timestamp override");
            return;
          }
          
          const coreServices = cachedCoreServices;
          const coreSettings = coreServices.coreSettings;
          
          // Check if setting is already correct
          if (coreSettings.get('compose').disableTimestampOnCopy === config.disableTimestampOnCopy) {
            console.debug('Preload: disableTimestampOnCopy setting is correct, stopping polling');
            if (timestampOverrideInterval) {
              clearInterval(timestampOverrideInterval);
              timestampOverrideInterval = null;
            }
            return;
          }

          console.debug("Preload: Applying timestamp copy override:", config.disableTimestampOnCopy);

          const overrides = {
            disableTimestampOnCopy: config.disableTimestampOnCopy
          };

          // Override the get method
          const originalGet = coreSettings.get;
          if (!coreSettings._originalGet) {
            coreSettings._originalGet = originalGet;
            coreSettings.get = function(category) {
              const settings = coreSettings._originalGet.call(this, category);
              if (category === 'compose') {
                return {
                  ...settings,
                  ...overrides
                };
              }
              return settings;
            };
          }

          // Override getLatestSettingsForCategory
          const originalGetLatest = coreSettings.getLatestSettingsForCategory;
          if (!coreSettings._originalGetLatest) {
            coreSettings._originalGetLatest = originalGetLatest;
            coreSettings.getLatestSettingsForCategory = function(category) {
              const settings = coreSettings._originalGetLatest.call(this, category);
              if (category === 'compose') {
                return {
                  ...settings,
                  ...overrides
                };
              }
              return settings;
            };
          }

          // Override the behavior subject
          const composeSubject = coreSettings.categoryBehaviorSubjectMap.get('compose');
          if (composeSubject && !composeSubject._originalNext) {
            composeSubject._originalNext = composeSubject.next;
            composeSubject.next = function(value) {
              if (value && typeof value === 'object') {
                value = {
                  ...value,
                  ...overrides
                };
              }
              return composeSubject._originalNext.call(this, value);
            };
          }

        } catch (err) {
          console.error("Preload: Failed to apply timestamp override:", err.message);
        }
      }

      waitForReactReady(() => {
        if (!timestampOverrideInitialized) {
          console.debug("Preload: Initializing timestamp copy override functionality inline");
          try {
            // Start polling mechanism - now with proper scope
            timestampOverrideInterval = setInterval(applyTimestampOverride, 1000);
            timestampOverrideInitialized = true;
            console.debug("Preload: Timestamp copy override polling started");
          } catch (err) {
            console.error("Preload: Failed to initialize timestamp copy override:", err.message);
          }
        }
      });
    } else {
      console.debug("Preload: Timestamp copy override not configured");
    }

    // Initialize notification functionality inline
    console.debug("Preload: Initializing notification functionality inline");
    
    // WakeLock functionality inline
    let wakeLockInstance = null;
    const wakeLockAPI = {
      async enable() {
        try {
          let lock = await navigator.wakeLock.request("screen");
          lock.addEventListener("release", () => {
            console.debug("Wake Lock was released");
          });
          console.debug("Wake Lock is active");
          wakeLockInstance = lock;
        } catch (err) {
          console.error(`wakelog enable error ${err.name}, ${err.message}`);
        }
      },
      
      async disable() {
        if (!wakeLockInstance) {
          return;
        }
        try {
          await wakeLockInstance.release();
          wakeLockInstance = null;
        } catch (err) {
          console.error(`wakelog disable error ${err.name}, ${err.message}`);
        }
      }
    };

    // ActivityHub functionality inline
    const eventHandlers = [];
    const supportedEvents = [
      "incoming-call-created",
      "incoming-call-ended", 
      "call-connected",
      "call-disconnected"
    ];

    function isSupportedEvent(event) {
      return supportedEvents.some(e => e === event);
    }

    function isFunction(func) {
      return typeof func === 'function';
    }

    function getHandleIndex(event, handle) {
      return eventHandlers.findIndex(h => h.event === event && h.handle === handle);
    }

    function addEventHandler(event, handler) {
      let handle;
      if (isSupportedEvent(event) && isFunction(handler)) {
        handle = crypto.randomUUID();
        eventHandlers.push({
          event: event,
          handle: handle,
          handler: handler
        });
      }
      return handle;
    }

    function removeEventHandler(event, handle) {
      const handlerIndex = getHandleIndex(event, handle);
      if (handlerIndex > -1) {
        eventHandlers[handlerIndex].handler = null;
        eventHandlers.splice(handlerIndex, 1);
        return handle;
      }
      return null;
    }

    function getEventHandlers(event) {
      return eventHandlers.filter(e => e.event === event);
    }

    const activityHubAPI = {
      on: addEventHandler,
      off: removeEventHandler,
      
      start() {
        waitForReactReady(() => {
          const commandChangeReportingService = reactHandler.getCommandChangeReportingService();
          if (commandChangeReportingService) {
            assignEventHandlers(commandChangeReportingService);
            console.debug("Preload: ActivityHub events connected");
          } else {
            console.error("Preload: Failed to get CommandChangeReportingService even after React ready");
          }
        });
      },

      setMachineState(state) {
        const teams2IdleTracker = reactHandler.getTeams2IdleTracker();
        if (teams2IdleTracker) {
          try {
            console.debug(`setMachineState teams2 state=${state}`);
            if (state === 1) {
              teams2IdleTracker.handleMonitoredWindowEvent();
            } else {
              teams2IdleTracker.transitionToIdle();
            }
          } catch (e) {
            console.error("Failed to set teams2 Machine State", e);
          }
        }
      },

      setUserStatus(status) {
        const teams2IdleTracker = reactHandler.getTeams2IdleTracker();
        if (teams2IdleTracker) {
          try {
            console.debug(`setUserStatus teams2 status=${status}`);
            if (status === 1) {
              teams2IdleTracker.handleMonitoredWindowEvent();
            } else {
              teams2IdleTracker.transitionToIdle();
            }
          } catch (e) {
            console.error("Failed to set teams2 User Status", e);
          }
        }
      },

      refreshAppState(controller, state) {
        const self = controller.appStateService;
        controller.appStateService.refreshAppState.apply(self, [
          () => {
            self.inactiveStartTime = null;
            self.setMachineState(state);
            self.setActive(
              state == 1 && (self.current == 4 || self.current == 5) ? 3 : self.current,
            );
          },
          "",
          null,
          null,
        ]);
      }
    };

    function assignEventHandlers(commandChangeReportingService) {
      commandChangeReportingService.observeChanges().subscribe((e) => {
        if (["CommandStart", "ScenarioMarked"].indexOf(e.type) < 0 ||
          ["internal-command-handler", "use-command-reporting-callbacks"].indexOf(e.context.target) < 0) {
          return;
        }
        if (e.context.entityCommand) {
          handleCallEventEntityCommand(e.context.entityCommand);
        } else {
          handleCallEventStep(e.context.step);
        }
      });
    }

    function handleCallEventEntityCommand(entityCommand) {
      if (entityCommand.entityOptions?.isIncomingCall) {
        console.debug("IncomingCall", entityCommand);
        if ("incoming_call" === entityCommand.entityOptions?.crossClientScenarioName) {
          console.debug("Call is incoming");
          onIncomingCallCreated({
            caller: entityCommand.entityOptions.title,
            image: entityCommand.entityOptions.mainImage?.src,
            text: entityCommand.entityOptions.text
          });
        } else {
          console.debug("Reacted to incoming call");
          onIncomingCallEnded();
        }
      }
    }

    function handleCallEventStep(step) {
      switch (step) {
        case "calling-screen-rendered":
          onCallConnected();
          break;
        case "render_disconected":
          onCallDisconnected();
          break;
        default:
          break;
      }
    }

    async function onIncomingCallCreated(data) {
      const handlers = getEventHandlers('incoming-call-created');
      for (const handler of handlers) {
        handler.handler(data);
      }
    }

    async function onIncomingCallEnded() {
      const handlers = getEventHandlers('incoming-call-ended');
      for (const handler of handlers) {
        handler.handler({});
      }
    }

    async function onCallConnected() {
      const handlers = getEventHandlers('call-connected');
      for (const handler of handlers) {
        handler.handler({});
      }
    }

    async function onCallDisconnected() {
      const handlers = getEventHandlers('call-disconnected');
      for (const handler of handlers) {
        handler.handler({});
      }
    }

    // ActivityManager functionality inline  
    let myStatus = -1;
    
    function setEventHandlers() {
      ipcRenderer.on("enable-wakelock", () => wakeLockAPI.enable());
      ipcRenderer.on("disable-wakelock", () => wakeLockAPI.disable());

      ipcRenderer.on('incoming-call-action', (event, action) => {
        console.debug("ActionHTML", document.body.innerHTML);
        const actionWrapper = document.querySelector('[data-testid="calling-actions"],[data-testid="msn-actions"]');
        if (actionWrapper) {
          const buttons = actionWrapper.querySelectorAll("button");
          if (buttons.length > 0) {
            switch (action) {
              case 'ACCEPT_AUDIO':
                if (buttons.length == 3) {
                  buttons[1].click();
                }
              case 'ACCEPT_VIDEO':
                buttons[0].click();
                break;
              case 'DECLINE':
                buttons[buttons.length - 1].click();
                break;
              default:
                break;
            }
          }
        }
      });
    }

    function setActivityHandlers() {
      activityHubAPI.on("incoming-call-created", async (data) => {
        ipcRenderer.invoke("incoming-call-created", data);
      });
      activityHubAPI.on("incoming-call-ended", async () => {
        ipcRenderer.invoke("incoming-call-ended");
      });
      activityHubAPI.on("call-connected", async () => {
        ipcRenderer.invoke("call-connected");
      });
      activityHubAPI.on("call-disconnected", async () => {
        ipcRenderer.invoke("call-disconnected");
      });
    }

    function watchSystemIdleState() {
      ipcRenderer.invoke("get-system-idle-state").then((state) => {
        let timeOut;
        if (config.awayOnSystemIdle) {
          timeOut = setStatusAwayWhenScreenLocked(state);
        } else {
          timeOut = keepStatusAvailableWhenScreenLocked(state);
        }
        setTimeout(() => watchSystemIdleState(), timeOut);
      });
    }

    function setStatusAwayWhenScreenLocked(state) {
      activityHubAPI.setMachineState(state.system === "active" ? 1 : 2);
      const timeOut = (state.system === "active"
        ? config.appIdleTimeoutCheckInterval
        : config.appActiveCheckInterval) * 1000;

      if (state.system === "active" && state.userIdle === 1) {
        activityHubAPI.setUserStatus(1);
      } else if (state.system !== "active" && state.userCurrent === 1) {
        activityHubAPI.setUserStatus(3);
      }
      return timeOut;
    }

    function keepStatusAvailableWhenScreenLocked(state) {
      if (state.system === "active" || state.system === "locked") {
        activityHubAPI.setMachineState(1);
        return config.appIdleTimeoutCheckInterval * 1000;
      }
      activityHubAPI.setMachineState(2);
      return config.appActiveCheckInterval * 1000;
    }

    // Initialize ActivityManager (wait for React readiness)
    setActivityHandlers();
    setEventHandlers();
    waitForReactReady(() => {
      activityHubAPI.start();
      watchSystemIdleState();
    });
    console.debug("Preload: Notification functionality initialized successfully");

    // Initialize other modules safely
    const modules = [];

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

    // Summary of inlined functionality
    console.log("Preload: All inline modules initialized successfully:");
    console.log("  ✓ Zoom functionality (webFrame integration)");
    console.log("  ✓ ReactHandler functionality (Teams API access)");
    console.log("  ✓ Theme management (system theme sync)"); 
    console.log("  ✓ Keyboard shortcuts (platform-specific)");
    console.log("  ✓ Settings management (IPC handlers preserved)");
    console.log("  ✓ Timestamp copy override (polling mechanism)");
    console.log("  ✓ Notification functionality (activityHub, wakeLock, activityManager)");

    // ActivityManager is now inlined above - no longer needed
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

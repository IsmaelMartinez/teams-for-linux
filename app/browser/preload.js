const { ipcRenderer } = require("electron");

// Note: IPC validation handled by main process, no need for duplicate validation here
window.electronAPI = {
  desktopCapture: {
    chooseDesktopMedia: (sources, cb) => {
      ipcRenderer
        .invoke("choose-desktop-media", sources)
        .then((streamId) => cb(streamId))
        .catch(err => {
          console.error('Desktop media choice failed:', err);
          cb(null);
        });
      return Date.now();
    },
    cancelChooseDesktopMedia: () => ipcRenderer.send("cancel-desktop-media"),
  },
  // Screen sharing events
  sendScreenSharingStarted: (sourceId) => {
    if (typeof sourceId === 'string' && sourceId.length < 100) {
      return ipcRenderer.send("screen-sharing-started", sourceId);
    }
    console.error('Invalid sourceId for screen sharing');
  },
  sendScreenSharingStopped: () => ipcRenderer.send("screen-sharing-stopped"),
  stopSharing: () => ipcRenderer.send("stop-screen-sharing-from-thumbnail"),
  sendSelectSource: () => ipcRenderer.send("select-source"),
  onSelectSource: (callback) => ipcRenderer.once("select-source", callback),
  send: (channel, ...args) => {
    return ipcRenderer.send(channel, ...args);
  },

  // Configuration
  getConfig: () => ipcRenderer.invoke("get-config"),

  // Notifications with input validation
  showNotification: (options) => {
    if (!options || typeof options !== 'object') {
      return Promise.reject(new Error('Invalid notification options'));
    }
    return ipcRenderer.invoke("show-notification", options);
  },
  playNotificationSound: (options) => {
    if (options && typeof options !== 'object') {
      return Promise.reject(new Error('Invalid sound options'));
    }
    return ipcRenderer.invoke("play-notification-sound", options);
  },

  // Badge count with validation
  setBadgeCount: (count) => {
    if (typeof count !== 'number' || count < 0 || count > 9999) {
      console.error('Invalid badge count:', count);
      return Promise.reject(new Error('Invalid badge count'));
    }
    return ipcRenderer.invoke("set-badge-count", count);
  },

  // Tray icon with validation
  updateTray: (icon, flash) => {
    return ipcRenderer.send("tray-update", { icon, flash });
  },

  // Theme events
  onSystemThemeChanged: (callback) => {
    if (typeof callback !== 'function') {
      console.error('Invalid callback for theme changed');
      return;
    }
    return ipcRenderer.on("system-theme-changed", callback);
  },

  // User status with validation
  setUserStatus: (data) => {
    if (!data || typeof data !== 'object') {
      return Promise.reject(new Error('Invalid user status data'));
    }
    return ipcRenderer.invoke("user-status-changed", data);
  },

  // Zoom with validation
  getZoomLevel: (partition) => {
    if (typeof partition !== 'string' || partition.length > 100) {
      return Promise.reject(new Error('Invalid partition'));
    }
    return ipcRenderer.invoke("get-zoom-level", partition);
  },
  saveZoomLevel: (data) => {
    if (!data || typeof data !== 'object' || typeof data.level !== 'number') {
      return Promise.reject(new Error('Invalid zoom data'));
    }
    return ipcRenderer.invoke("save-zoom-level", data);
  },

  // System information (safe to expose)
  sessionType: process.env.XDG_SESSION_TYPE || "x11",
};

// Direct Node.js access for browser tools (requires contextIsolation: false)
window.nodeRequire = require;
window.nodeProcess = process;

// Initialize browser modules after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log("Preload: DOMContentLoaded, initializing browser modules...");
  try {
    const config = await ipcRenderer.invoke("get-config");
    console.log("Preload: Got config:", { 
      trayIconEnabled: config?.trayIconEnabled, 
      useMutationTitleLogic: config?.useMutationTitleLogic 
    });
    
    // Initialize title monitoring using existing module
    if (config.useMutationTitleLogic) {
      const mutationTitle = require("./tools/mutationTitle");
      mutationTitle.init(config);
    }
    
    // Initialize tray icon functionality directly in preload with secure IPC
    if (config.trayIconEnabled) {
      console.debug("Preload: tray icon is enabled");
      
      // v2.5.4: Enhanced logging for tray icon timing issue (#1795)
      window.addEventListener("unread-count", (event) => {
        try {
          const count = event.detail?.number;
          console.debug("Preload: Received unread-count event", {
            count: count,
            eventDetail: event.detail,
            timestamp: new Date().toISOString()
          });
          
          if (typeof count !== 'number' || count < 0 || count > 9999) {
            console.warn('Preload: Invalid unread count received:', count);
            return;
          }
          
          console.debug("Preload: Sending tray-update to main process", {
            count: count,
            flash: count > 0 && !config.disableNotificationWindowFlash
          });
          
          ipcRenderer.send("tray-update", {
            icon: null, // Let main process handle icon rendering
            flash: count > 0 && !config.disableNotificationWindowFlash,
            count: count
          });
          
          ipcRenderer.invoke("set-badge-count", count).catch(err => {
            console.error('Preload: Failed to set badge count:', err);
          });
        } catch (error) {
          console.error('Preload: Error in tray update handler:', error);
        }
      });
      
      console.debug("Preload: Tray icon unread-count event listener registered");
    }
    
    console.log("Preload: Essential tray modules initialized successfully");
    
    // Initialize other modules safely
    const modules = [
      { name: "zoom", path: "./tools/zoom" },
      { name: "shortcuts", path: "./tools/shortcuts" },
      { name: "settings", path: "./tools/settings" },
      { name: "theme", path: "./tools/theme" },
      { name: "emulatePlatform", path: "./tools/emulatePlatform" },
      { name: "timestampCopyOverride", path: "./tools/timestampCopyOverride" }
    ];
    
    let successCount = 0;
    modules.forEach(module => {
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
    
    console.log(`Preload: ${successCount}/${modules.length} browser modules initialized successfully`);
    
    // Initialize ActivityManager
    try {
      const ActivityManager = require("./notifications/activityManager");
      new ActivityManager(ipcRenderer, config).start();
    } catch (err) {
      console.error("Preload: ActivityManager failed to initialize:", err.message);
    }
    
  } catch (error) {
    console.error("Preload: Failed to initialize browser modules:", error);
  }
});

// Forward unhandled promise rejections and window errors to main for diagnostics with secure IPC
try {
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event && event.reason;
      const errorData = {
        message: reason && reason.message ? String(reason.message).substring(0, 1000) : String(reason).substring(0, 1000),
        stack: reason && reason.stack ? String(reason.stack).substring(0, 5000) : null,
        timestamp: Date.now(),
        // Keep the raw reason only when it's a plain object to avoid huge payloads
        reason: typeof reason === "object" && reason !== null ? reason : null,
      };
      
      ipcRenderer.send("unhandled-rejection", errorData);
    } catch (err) {
      console.debug("Unhandled rejection forwarding failed:", err);
      // Best-effort forwarding, never throw from preload
    }
  });

  window.addEventListener("error", (event) => {
    try {
      const errorData = {
        message: event && event.message ? String(event.message).substring(0, 1000) : '',
        filename: event && event.filename ? String(event.filename).substring(0, 200) : '',
        lineno: event && typeof event.lineno === 'number' ? event.lineno : 0,
        colno: event && typeof event.colno === 'number' ? event.colno : 0,
        timestamp: Date.now(),
        errorStack: event && event.error && event.error.stack ? String(event.error.stack).substring(0, 5000) : null,
      };
      
      ipcRenderer.send("window-error", errorData);
    } catch (err) {
      console.debug("Window error forwarding failed:", err);
    }
  });
} catch (err) {
  console.debug("Error handler setup failed:", err);
}

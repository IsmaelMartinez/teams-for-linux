const { ipcRenderer } = require("electron");

// Secure IPC validation patterns as compensating control for disabled contextIsolation
function createSecureIPCPattern() {
  const allowedChannels = {
    invoke: [
      'get-config',
      'show-notification', 
      'play-notification-sound',
      'set-badge-count',
      'user-status-changed',
      'get-zoom-level',
      'save-zoom-level',
      'choose-desktop-media'
    ],
    send: [
      'cancel-desktop-media',
      'screen-sharing-started',
      'screen-sharing-stopped', 
      'stop-screen-sharing-from-thumbnail',
      'select-source',
      'active-screen-share-stream',
      'tray-update',
      'unhandled-rejection',
      'window-error'
    ]
  };

  function validateChannel(method, channel) {
    const allowed = allowedChannels[method] || [];
    if (!allowed.includes(channel)) {
      console.error(`SecureIPC: Blocked unauthorized ${method} to channel: ${channel}`);
      return false;
    }
    return true;
  }

  function validateArgs(args) {
    // Basic validation to prevent dangerous payloads
    try {
      JSON.stringify(args); // Ensure serializable
      const totalSize = JSON.stringify(args).length;
      if (totalSize > 100000) { // 100KB limit
        console.error('SecureIPC: Payload too large:', totalSize);
        return false;
      }
      return true;
    } catch (error) {
      console.error('SecureIPC: Invalid arguments:', error);
      return false;
    }
  }

  return {
    invoke: (channel, ...args) => {
      if (!validateChannel('invoke', channel) || !validateArgs(args)) {
        return Promise.reject(new Error('IPC validation failed'));
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel, ...args) => {
      if (!validateChannel('send', channel) || !validateArgs(args)) {
        console.error('SecureIPC: Send blocked');
        return;
      }
      return ipcRenderer.send(channel, ...args);
    },
    on: (channel, callback) => {
      // Only allow specific channels for listening
      const allowedListenChannels = ['system-theme-changed', 'select-source', 'incoming-call-action'];
      if (!allowedListenChannels.includes(channel)) {
        console.error('SecureIPC: Listen blocked for channel:', channel);
        return;
      }
      return ipcRenderer.on(channel, callback);
    },
    once: (channel, callback) => {
      const allowedOnceChannels = ['select-source'];
      if (!allowedOnceChannels.includes(channel)) {
        console.error('SecureIPC: Once blocked for channel:', channel);
        return;
      }
      return ipcRenderer.once(channel, callback);
    }
  };
}

const secureIPC = createSecureIPCPattern();

// Note: contextBridge not used since contextIsolation is disabled
// APIs are now directly available to the renderer process via window object with secure IPC patterns
window.electronAPI = {
  desktopCapture: {
    chooseDesktopMedia: (sources, cb) => {
      secureIPC
        .invoke("choose-desktop-media", sources)
        .then((streamId) => cb(streamId))
        .catch(err => {
          console.error('Desktop media choice failed:', err);
          cb(null);
        });
      return Date.now();
    },
    cancelChooseDesktopMedia: () => secureIPC.send("cancel-desktop-media"),
  },
  // Screen sharing events with secure IPC
  sendScreenSharingStarted: (sourceId) => {
    if (typeof sourceId === 'string' && sourceId.length < 100) {
      return secureIPC.send("screen-sharing-started", sourceId);
    }
    console.error('Invalid sourceId for screen sharing');
  },
  sendScreenSharingStopped: () => secureIPC.send("screen-sharing-stopped"),
  stopSharing: () => secureIPC.send("stop-screen-sharing-from-thumbnail"),
  sendSelectSource: () => secureIPC.send("select-source"),
  onSelectSource: (callback) => secureIPC.once("select-source", callback),
  send: (channel, ...args) => {
    // Use secure IPC for allowed channels only
    return secureIPC.send(channel, ...args);
  },

  // Configuration
  getConfig: () => secureIPC.invoke("get-config"),

  // Notifications with input validation
  showNotification: (options) => {
    if (!options || typeof options !== 'object') {
      return Promise.reject(new Error('Invalid notification options'));
    }
    return secureIPC.invoke("show-notification", options);
  },
  playNotificationSound: (options) => {
    if (options && typeof options !== 'object') {
      return Promise.reject(new Error('Invalid sound options'));
    }
    return secureIPC.invoke("play-notification-sound", options);
  },

  // Badge count with validation
  setBadgeCount: (count) => {
    if (typeof count !== 'number' || count < 0 || count > 9999) {
      console.error('Invalid badge count:', count);
      return Promise.reject(new Error('Invalid badge count'));
    }
    return secureIPC.invoke("set-badge-count", count);
  },

  // Tray icon with validation
  updateTray: (icon, flash) => {
    return secureIPC.send("tray-update", { icon, flash });
  },

  // Theme events
  onSystemThemeChanged: (callback) => {
    if (typeof callback !== 'function') {
      console.error('Invalid callback for theme changed');
      return;
    }
    return secureIPC.on("system-theme-changed", callback);
  },

  // User status with validation
  setUserStatus: (data) => {
    if (!data || typeof data !== 'object') {
      return Promise.reject(new Error('Invalid user status data'));
    }
    return secureIPC.invoke("user-status-changed", data);
  },

  // Zoom with validation
  getZoomLevel: (partition) => {
    if (typeof partition !== 'string' || partition.length > 100) {
      return Promise.reject(new Error('Invalid partition'));
    }
    return secureIPC.invoke("get-zoom-level", partition);
  },
  saveZoomLevel: (data) => {
    if (!data || typeof data !== 'object' || typeof data.level !== 'number') {
      return Promise.reject(new Error('Invalid zoom data'));
    }
    return secureIPC.invoke("save-zoom-level", data);
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
    const config = await secureIPC.invoke("get-config");
    console.log("Preload: Got config:", { 
      trayIconEnabled: config?.trayIconEnabled, 
      useMutationTitleLogic: config?.useMutationTitleLogic 
    });
    
    // Initialize title monitoring directly in preload with validation
    if (config.useMutationTitleLogic) {
      console.debug("Preload: MutationObserverTitle enabled");
      const observer = new MutationObserver(() => {
        try {
          const title = document.title;
          if (typeof title !== 'string') return;
          
          const sanitizedTitle = title.substring(0, 200); // Limit title length
          console.debug(`title changed to ${sanitizedTitle}`);
          
          const regex = /^\((\d+)\)/;
          const match = regex.exec(sanitizedTitle);
          const number = match ? parseInt(match[1], 10) : 0;
          
          // Validate extracted number
          if (isNaN(number) || number < 0 || number > 9999) {
            console.warn('Invalid unread count extracted:', number);
            return;
          }
          
          const event = new CustomEvent("unread-count", {
            detail: { number: number },
          });
          window.dispatchEvent(event);
        } catch (error) {
          console.error('Error in title observer:', error);
        }
      });
      
      const titleElement = document.querySelector("title");
      if (titleElement) {
        observer.observe(titleElement, {
          childList: true,
        });
      }
    }
    
    // Initialize tray icon functionality directly in preload with secure IPC
    if (config.trayIconEnabled) {
      console.debug("Preload: tray icon is enabled");
      window.addEventListener("unread-count", (event) => {
        try {
          const count = event.detail?.number;
          if (typeof count !== 'number' || count < 0 || count > 9999) {
            console.warn('Invalid unread count:', count);
            return;
          }
          
          console.debug("sending tray-update");
          secureIPC.send("tray-update", {
            icon: null, // Let main process handle icon rendering
            flash: count > 0 && !config.disableNotificationWindowFlash,
            count: count
          });
          secureIPC.invoke("set-badge-count", count).catch(err => {
            console.error('Failed to set badge count:', err);
          });
        } catch (error) {
          console.error('Error in tray update:', error);
        }
      });
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
      
      secureIPC.send("unhandled-rejection", errorData);
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
      
      secureIPC.send("window-error", errorData);
    } catch (err) {
      console.debug("Window error forwarding failed:", err);
    }
  });
} catch (err) {
  console.debug("Error handler setup failed:", err);
}

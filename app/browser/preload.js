const { ipcRenderer } = require("electron");

// Note: IPC validation handled by main process, no need for duplicate validation here
globalThis.electronAPI = {
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
    if (sourceId === null || (typeof sourceId === 'string' && sourceId.length < 100)) {
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
  sendNotificationToast: (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid notification toast data');
    }
    ipcRenderer.send("notification-show-toast", data);
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

  // Navigation
  navigateBack: () => ipcRenderer.send("navigate-back"),
  navigateForward: () => ipcRenderer.send("navigate-forward"),
  getNavigationState: () => ipcRenderer.invoke("get-navigation-state"),
  onNavigationStateChanged: (callback) => {
    if (typeof callback !== 'function') {
      console.error('Invalid callback for navigation state changed');
      return;
    }
    return ipcRenderer.on("navigation-state-changed", callback);
  },

  // Microsoft Graph API
  graphApi: {
    getUserProfile: () => ipcRenderer.invoke("graph-api-get-user-profile"),
    getCalendarEvents: (options) => ipcRenderer.invoke("graph-api-get-calendar-events", options),
    getCalendarView: (start, end, options) => ipcRenderer.invoke("graph-api-get-calendar-view", start, end, options),
    createCalendarEvent: (event) => ipcRenderer.invoke("graph-api-create-calendar-event", event),
    getMailMessages: (options) => ipcRenderer.invoke("graph-api-get-mail-messages", options),
  },

  // Chat deep link navigation (for quick chat access feature)
  openChatWithUser: (email) => {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      console.error('Invalid email for chat deep link');
      return false;
    }
    // Use the current Teams base URL (could be teams.cloud.microsoft or teams.microsoft.com)
    const currentOrigin = globalThis.location.origin;
    const chatPath = `/l/chat/0/0?users=${encodeURIComponent(email)}`;
    const chatUrl = `${currentOrigin}${chatPath}`;
    console.debug('[CHAT_LINK] Navigating to chat via deep link');
    globalThis.location.href = chatUrl;
    return true;
  },

  // System information (safe to expose)
  sessionType: process.env.XDG_SESSION_TYPE || "x11",
};

// Fetch config and override Notification immediately (matching v2.2.1 pattern)
// Config is fetched asynchronously but notification function references it via closure
let notificationConfig = null;
// Use promise chain instead of async IIFE for SonarQube compatibility
ipcRenderer.invoke("get-config").then((config) => {
  notificationConfig = config;
  console.debug("Preload: Config loaded for notifications:", {
    notificationMethod: config?.notificationMethod,
    disableNotifications: config?.disableNotifications
  });
}).catch((err) => {
  console.error("Preload: Failed to load config for notifications:", err);
});

// Helper functions for notification handling (extracted to reduce cognitive complexity)
function playNotificationSound(notifSound) {
  if (globalThis.electronAPI?.playNotificationSound) {
    try {
      console.debug("Requesting application to play sound");
      globalThis.electronAPI.playNotificationSound(notifSound);
    } catch (e) {
      console.debug("playNotificationSound failed", e);
    }
  }
}

function createWebNotification(classicNotification, title, options) {
  // Play notification sound
  const notifSound = {
    type: options.type,
    audio: "default",
    title: title,
    body: options.body,
  };
  playNotificationSound(notifSound);

  // Return actual native notification object (critical for Teams to manage lifecycle)
  console.debug("Continues to default notification workflow");
  if (classicNotification) {
    try {
      return new classicNotification(title, options);
    } catch (err) {
      console.debug("Could not create native notification:", err);
      return null;
    }
  }
  return null;
}

function createElectronNotification(options) {
  // Use Electron notification
  if (globalThis.electronAPI?.showNotification) {
    try {
      globalThis.electronAPI.showNotification(options);
    } catch (e) {
      console.debug("showNotification failed", e);
    }
  }
  // Return stub object for Electron notifications
  return { onclick: null, onclose: null, onerror: null };
}

function createCustomNotification(title, options) {
  // Send notification data to main process for custom toast notification
  const notificationData = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    title: title,
    body: options.body || '',
    icon: options.icon,
  };

  // Play notification sound if enabled
  const notifSound = {
    type: options.type,
    audio: "default",
    title: title,
    body: options.body,
  };
  playNotificationSound(notifSound);

  // Send to main process to show toast
  try {
    if (globalThis.electronAPI?.sendNotificationToast) {
      globalThis.electronAPI.sendNotificationToast(notificationData);
    } else {
      console.warn("sendNotificationToast API not available");
    }
  } catch (e) {
    console.error("Failed to send custom notification:", e);
  }

  // Return stub object
  return { onclick: null, onclose: null, onerror: null };
}

// Override window.Notification immediately before Teams loads
// Using factory function pattern instead of class to avoid "return in constructor" anti-pattern
(function() {
  const ICON_BASE64 =
    "data:image/png;base64,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";

  const classicNotification = globalThis.Notification;

  // Factory function that creates notification objects (avoids "return in constructor" issue)
  function CustomNotification(title, options) {
    // Use config from closure scope (will be null initially, populated async)
    if (notificationConfig?.disableNotifications) {
      // Return dummy object to avoid Teams errors
      return { onclick: null, onclose: null, onerror: null };
    }

    options = options || {};
    options.icon = options.icon || ICON_BASE64;
    options.title = options.title || title;
    options.type = options.type || "new-message";
    // Explicitly set false for Ubuntu Unity DE auto-close. Others are unaffected.
    options.requireInteraction = false;

    // Default to "web" if config not loaded yet
    const method = notificationConfig?.notificationMethod || "web";

    if (method === "custom") {
      return createCustomNotification(title, options);
    }

    if (method === "web") {
      const notification = createWebNotification(classicNotification, title, options);
      return notification || { onclick: null, onclose: null, onerror: null };
    }

    return createElectronNotification(options);
  }

  // Add static methods to factory function
  CustomNotification.requestPermission = async function() {
    return "granted";
  };

  Object.defineProperty(CustomNotification, 'permission', {
    get: function() {
      return "granted";
    }
  });

  globalThis.Notification = CustomNotification;
  console.debug("Preload: CustomNotification factory initialized");
})();

// Initialize browser modules after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.debug("Preload: DOMContentLoaded, initializing browser modules...");
  try {
    const config = await ipcRenderer.invoke("get-config");
    console.debug("Preload: Got config:", {
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
      // NOTE: unread-count event is handled by trayIconRenderer.js
      // This redundant listener was causing duplicate IPC traffic and rendering.
    }
    
    console.debug("Preload: Essential tray modules initialized successfully");
    
    // Initialize other modules safely
    const modules = [
      { name: "zoom", path: "./tools/zoom" },
      { name: "shortcuts", path: "./tools/shortcuts" },
      { name: "settings", path: "./tools/settings" },
      { name: "theme", path: "./tools/theme" },
      { name: "emulatePlatform", path: "./tools/emulatePlatform" },
      { name: "timestampCopyOverride", path: "./tools/timestampCopyOverride" },
      { name: "trayIconRenderer", path: "./tools/trayIconRenderer" },
      { name: "mqttStatusMonitor", path: "./tools/mqttStatusMonitor" },
      { name: "disableAutogain", path: "./tools/disableAutogain" },
      { name: "cameraResolution", path: "./tools/cameraResolution" },
      { name: "cameraAspectRatio", path: "./tools/cameraAspectRatio" },
      { name: "navigationButtons", path: "./tools/navigationButtons" },
      { name: "framelessTweaks", path: "./tools/frameless" }
    ];

    // CRITICAL: These modules need ipcRenderer for IPC communication (see CLAUDE.md)
    const modulesRequiringIpc = new Set(["settings", "theme", "trayIconRenderer", "mqttStatusMonitor"]);

    let successCount = 0;
    for (const module of modules) {
      try {
        const moduleInstance = require(module.path);
        if (modulesRequiringIpc.has(module.name)) {
          moduleInstance.init(config, ipcRenderer);
        } else {
          moduleInstance.init(config);
        }
        successCount++;
      } catch (err) {
        console.error(`Preload: Failed to load ${module.name}:`, err.message);
      }
    }
    
    console.info(`Preload: ${successCount}/${modules.length} browser modules initialized successfully`);

    // Initialize ActivityManager
    try {
      const ActivityManager = require("./notifications/activityManager");
      new ActivityManager(ipcRenderer, config).start();
    } catch (err) {
      console.error("Preload: ActivityManager failed to initialize:", err.message);
    }

    // Listen for config changes from the main process (e.g., when menu toggles are clicked)
    ipcRenderer.on("config-changed", (_event, configChanges) => {
      // Update the local config object with the changes
      for (const [key, value] of Object.entries(configChanges)) {
        config[key] = value;
      }
    });

  } catch (error) {
    console.error("Preload: Failed to initialize browser modules:", error);
  }
});

// Forward unhandled promise rejections and window errors to main for diagnostics with secure IPC
try {
  globalThis.addEventListener("unhandledrejection", (event) => {
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

  globalThis.addEventListener("error", (event) => {
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

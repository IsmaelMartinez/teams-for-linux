const { contextBridge, ipcRenderer } = require("electron");

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

  // System information (safe to expose)
  sessionType: process.env.XDG_SESSION_TYPE || "x11",
});

// Initialize browser modules after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log("Preload: DOMContentLoaded, initializing browser modules...");
  try {
    const config = await ipcRenderer.invoke("get-config");
    console.log("Preload: Got config:", { 
      trayIconEnabled: config?.trayIconEnabled, 
      useMutationTitleLogic: config?.useMutationTitleLogic 
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
          count: count
        });
        ipcRenderer.invoke("set-badge-count", count);
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

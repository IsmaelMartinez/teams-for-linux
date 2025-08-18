const { contextBridge, ipcRenderer } = require("electron");

// Inject MSAL logger as early as possible so Teams' MSAL usage can pick it up.
// This will not throw if msal isn't present at preload time.
try {
  // Expose a small helper on window so the page code can attach MSAL logger
  // when msal becomes available.
  const attachMsalLogger = (win) => {
    try {
      if (!win || !win.msal) return false;

      const msal = win.msal;
      if (!msal.Logger) return false;

      const logger = new msal.Logger(
        (level, message, containsPii) => {
          // Forward MSAL logs to the Electron renderer console
          try {
            console.debug(`[MSAL ${level}] ${message} (pii:${containsPii})`);
          } catch (err) {
            console.debug("MSAL log forward failed", err);
          }
        },
        {
          level: msal.LogLevel ? msal.LogLevel.Verbose : 3,
          piiLoggingEnabled: true,
        }
      );

      // Patch PublicClientApplication to set the logger on constructed instances
      if (msal.PublicClientApplication) {
        const OldPCA = msal.PublicClientApplication;
        msal.PublicClientApplication = function () {
          const app = new (Function.prototype.bind.apply(
            OldPCA,
            [null].concat(Array.prototype.slice.call(arguments))
          ))();
          try {
            if (typeof app.setLogger === "function") app.setLogger(logger);
          } catch (err) {
            console.debug("MSAL setLogger failed", err);
          }
          return app;
        };
      }

      return true;
    } catch {
      return false;
    }
  };

  // Expose for the page to call later if msal isn't yet loaded
  contextBridge.exposeInMainWorld("msalHelper", {
    attachLogger: () => attachMsalLogger(window),
  });
} catch {
  // noop
}

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
    } catch {
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
    } catch {
      // noop
    }
  });
} catch {
  // noop
}

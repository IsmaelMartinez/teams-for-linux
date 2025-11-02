(function () {
  // Shared notification initializer used by renderer and injected scripts.
  // Exposes a CustomNotification class on window.Notification that delegates
  // work to the provided API (getConfig, playNotificationSound, showNotification).
  // initialConfig is optional — when provided it allows synchronous behavior
  // (used by renderer which already has the config), otherwise getConfig() will
  // be used asynchronously (used by the injected script).
  const ICON_BASE64 =
    "data:image/png;base64,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";

  function createCustomNotification(window, api, initialConfig) {
    const classicNotification =
      window.__classicNotification__ || window.Notification;

    class CustomNotification {
      constructor(title, options) {
        options = options || {};
        options.icon = options.icon || ICON_BASE64;
        options.title = options.title || title;
        options.type = options.type || "new-message";
        options.requireInteraction = false;

        const handleWebNotification = (notifSound) => {
          if (api && typeof api.playNotificationSound === "function") {
            try {
              api.playNotificationSound(notifSound);
            } catch (e) {
              console.debug("playNotificationSound failed", e);
            }
          }
          if (classicNotification) {
            try {
              return new classicNotification(title, options);
            } catch (err) {
              console.debug("Could not create native notification:", err);
            }
          }
        };

        const handleElectronNotification = () => {
          if (api && typeof api.showNotification === "function") {
            try {
              api.showNotification(options);
            } catch (e) {
              console.debug("showNotification failed", e);
            }
          }
        };

        const handleConfig = (config) => {
          if (config?.disableNotifications) return;

          if (config.notificationMethod === "web") {
            const notifSound = {
              type: options.type,
              audio: "default",
              title: title,
              body: options.body,
            };
            handleWebNotification(notifSound);
          } else {
            handleElectronNotification();
          }
        };

        if (initialConfig) {
          handleConfig(initialConfig);
        } else if (api && typeof api.getConfig === "function") {
          try {
            api
              .getConfig()
              .then(handleConfig)
              .catch((e) => console.debug(e));
          } catch (e) {
            console.debug(e);
          }
        }

        this.onclick = null;
        this.onclose = null;
        this.onerror = null;
      }

      static async requestPermission() {
        return "granted";
      }

      static get permission() {
        return "granted";
      }
    }

    if (!globalThis.__classicNotification__)
      globalThis.__classicNotification__ = classicNotification;
    // Only initialize once. If another context already initialized the
    // custom Notification (for example the browser/renderer), do not overwrite it.
    if (!globalThis.__customNotificationInitialized__) {
      globalThis.Notification = CustomNotification;
      globalThis.__customNotificationInitialized__ = true;
    }
  }

  // Export for Node.js module system (used by preload.js)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createCustomNotification };
  } else {
    // Attempt to initialize if running in injected context (not as a module).
    // This ensures self-initialization only occurs when the file is loaded
    // directly, not when required as a CommonJS module.
    try {
      if (globalThis.window !== undefined && globalThis.electronAPI) {
        // If nothing else initialized it yet, call createCustomNotification.
        if (!globalThis.__customNotificationInitialized__) {
          createCustomNotification(globalThis, globalThis.electronAPI);
        }
      }
    } catch (err) {
      console.debug("Could not initialize injected CustomNotification", err);
    }
  }
})();

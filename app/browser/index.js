(function () {
  const { ipcRenderer } = require("electron");
  const ActivityManager = require("./notifications/activityManager");

  let config;
  ipcRenderer.invoke("get-config").then((mainConfig) => {
    config = mainConfig;
    initializeModules(config, ipcRenderer);
    new ActivityManager(ipcRenderer, config).start();
  });

  // Use shared notification implementation to avoid duplication between
  // renderer and injected contexts. Wrap ipcRenderer so the shared module
  // can call the expected methods.
  const rendererAPI = {
    playNotificationSound: (notif) =>
      ipcRenderer.invoke("play-notification-sound", notif),
    showNotification: (opts) => ipcRenderer.invoke("show-notification", opts),
    getConfig: () => Promise.resolve(config),
  };

  // Use the injectedNotification module which now contains the shared
  // createCustomNotification implementation.
  try {
    const common = require("./notifications/injectedNotification");
    // If the injected module didn't initialize (because it expects the
    // renderer API), call createCustomNotification directly.
    if (common && typeof common.createCustomNotification === "function") {
      common.createCustomNotification(window, rendererAPI, config);
    }
  } catch {
    // Fall back to attempting direct initialization via require path
    try {
      require("./notifications/injectedNotification").createCustomNotification(
        window,
        rendererAPI,
        config
      );
    } catch (err) {
      console.debug("Could not initialize notification module", err);
    }
  }
})();

function initializeModules(config, ipcRenderer) {
  require("./tools/zoom").init(config);
  require("./tools/shortcuts").init(config);
  require("./tools/mutationTitle").init(config);
  if (config.trayIconEnabled) {
    console.debug("tray icon is enabled");
    require("./tools/trayIconRenderer").init(config, ipcRenderer);
  }
  require("./tools/settings").init(config, ipcRenderer);
  require("./tools/theme").init(config, ipcRenderer);
  require("./tools/emulatePlatform").init(config);
  require("./tools/timestampCopyOverride").init(config);
}

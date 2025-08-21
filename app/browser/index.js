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
    if (common?.createCustomNotification) {
      common.createCustomNotification(window, rendererAPI, config);
    }
  } catch (err) {
    console.debug("Could not initialize notification module:", err);
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

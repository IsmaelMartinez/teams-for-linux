const { ipcRenderer } = require("electron");
const disableAutogain = require("./disableAutogain");
// In order to have this functionality working, contextIsolation should be disabled.
// In new versions of electron, contextIsolation is set to true by default.
// We should explicitly set it to false when creating BrowserWindow

let _getDisplayMedia;

function init(config) {
  window.addEventListener("DOMContentLoaded", () => {
    if (process.env.XDG_SESSION_TYPE === "wayland") {
      _getDisplayMedia = MediaDevices.prototype.getDisplayMedia;
      MediaDevices.prototype.getDisplayMedia = customGetDisplayMediaWayland;
    } else {
      MediaDevices.prototype.getDisplayMedia = customGetDisplayMediaX11;
    }

    if (config.disableAutogain) {
      disableAutogain();
    }
  });
}

async function customGetDisplayMediaWayland(...args) {
  args[0].audio = false;
  args[0].systemAudio = "exclude";

  return await _getDisplayMedia.apply(navigator.mediaDevices, args);
}

function customGetDisplayMediaX11() {
  return new Promise((resolve, reject) => {
    // Request main process to allow access to screen sharing
    ipcRenderer.once("select-source", (_event, source) => {
      startStreaming({ source, resolve, reject });
    });
    ipcRenderer.send("select-source");
  });
}

function startStreaming(properties) {
  console.debug("chromeApi.js: startStreaming called with properties:", properties);
  if (properties.source) {
    const sourceIdToSend = properties.source.id; // Use the sourceId that was used to create the stream
    console.debug(
      "Sending screen-sharing-started with sourceId:",
      sourceIdToSend
    );
    ipcRenderer.send("screen-sharing-started", sourceIdToSend);
    properties.resolve(); // Resolve the promise as the stream will be handled by the main process
  } else {
    properties.reject("Access denied");
  }
}

module.exports = init;

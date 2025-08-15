const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let inAppUIWindow = null;

function createInAppWindow(options) {
  const {
    width,
    height,
    show,
    frame,
    preload,
    htmlFile,
    alwaysOnTop,
    partition,
  } = options;

  const window = new BrowserWindow({
    width: width || 800,
    height: height || 600,
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    resizable: options.resizable !== undefined ? options.resizable : true,
    show: show || false,
    frame: frame !== undefined ? frame : true,
    alwaysOnTop: alwaysOnTop || false,
    webPreferences: {
      preload: path.join(__dirname, preload),
      partition: partition || undefined,
    },
  });

  window.loadFile(path.join(__dirname, htmlFile));

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    // Handle window closure, e.g., set inAppUIWindow to null if it was the in-app UI
    if (htmlFile === "inAppUI.html") {
      inAppUIWindow = null;
    }
  });

  return window;
}

function createInAppUIWindow(config) {
  if (!config?.enableInAppUI) {
    // Check the new config option
    return;
  }

  if (inAppUIWindow) {
    inAppUIWindow.focus();
    return;
  }

  inAppUIWindow = createInAppWindow({
    width: 800,
    height: 600,
    show: false,
    frame: false,
    preload: "preload.js",
    htmlFile: "inAppUI.html",
  });
}

ipcMain.on("close-in-app-ui-window", () => {
  if (inAppUIWindow) {
    inAppUIWindow.close();
  }
});





module.exports = {
  createInAppUIWindow,
};

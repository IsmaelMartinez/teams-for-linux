const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let inAppUIWindow = null;
let callPopOutWindowInstance = null;

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
      nodeIntegration: false,
      contextIsolation: true,
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
    } else if (htmlFile === "callPopOut.html") {
      callPopOutWindowInstance = null;
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

ipcMain.on("close-call-pop-out-window", () => {
  if (callPopOutWindowInstance && !callPopOutWindowInstance.isDestroyed()) {
    callPopOutWindowInstance.close();
  }
});

ipcMain.on("resize-call-pop-out-window", (event, { width, height }) => {
  if (callPopOutWindowInstance && !callPopOutWindowInstance.isDestroyed()) {
    const [currentWidth, currentHeight] = callPopOutWindowInstance.getSize();
    const [minWidth, minHeight] = callPopOutWindowInstance.getMinimumSize();

    // Ensure we respect minimum sizes and keep window small (thumbnail size)
    const newWidth = Math.max(minWidth, Math.min(width, 480));
    const newHeight = Math.max(minHeight, Math.min(height, 360));

    if (newWidth !== currentWidth || newHeight !== currentHeight) {
      callPopOutWindowInstance.setSize(newWidth, newHeight);
      callPopOutWindowInstance.center();
    }
  }
});

function createCallPopOutWindow(config) {
  if (callPopOutWindowInstance && !callPopOutWindowInstance.isDestroyed()) {
    callPopOutWindowInstance.focus();
    return;
  }

  callPopOutWindowInstance = createInAppWindow({
    width: 320,
    height: 180,
    minWidth: 200,
    minHeight: 120,
    show: false,
    resizable: true,
    alwaysOnTop: config.alwaysOnTop || false,
    preload: "callPopOutPreload.js",
    htmlFile: "callPopOut.html",
    partition: "persist:teams-for-linux-session",
  });

  callPopOutWindowInstance.on("closed", () => {
    // Send IPC event to indicate screen sharing has ended
    try {
      const { ipcMain } = require("electron");
      ipcMain.emit('popup-window-closed');
    } catch (error) {
      console.error('Error sending popup-window-closed event:', error);
    }
    callPopOutWindowInstance = null;
  });

  callPopOutWindowInstance.once('ready-to-show', () => {
    try {
      const { ipcMain } = require("electron");
      ipcMain.emit('popup-window-opened');
    } catch (error) {
      console.error('Error sending popup-window-opened event:', error);
    }
  });
}

function closeCallPopOutWindow() {
  if (callPopOutWindowInstance && !callPopOutWindowInstance.isDestroyed()) {
    callPopOutWindowInstance.close();
    callPopOutWindowInstance = null;
  }
}

module.exports = {
  createInAppUIWindow,
  createCallPopOutWindow,
  closeCallPopOutWindow,
};

// app/webauthn/touchPrompt.js

/**
 * Touch prompt window (#2631).
 *
 * fido2-assert blocks silently while the key waits for a touch, and the key
 * itself only blinks. Without an on-screen prompt users don't realise a touch
 * is expected and the ceremony times out. This window is display-only: no
 * input, no IPC, shown inactive so it never steals focus from the login page.
 * The caller closes it when the ceremony resolves.
 */

const { BrowserWindow } = require("electron");
const path = require("node:path");

/**
 * Show the touch prompt. Never throws: a failure to show the prompt must not
 * break the ceremony it decorates.
 *
 * @returns {{ close: () => void }}
 */
function showTouchPrompt() {
  let win = null;
  try {
    win = new BrowserWindow({
      width: 380,
      height: 130,
      frame: true,
      show: false,
      resizable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: "Security Key",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.once("ready-to-show", () => {
      if (!win.isDestroyed()) win.showInactive();
    });
    win.loadFile(path.join(__dirname, "touchPrompt.html"));
  } catch {
    win = null;
  }

  return {
    close() {
      if (win && !win.isDestroyed()) win.close();
      win = null;
    },
  };
}

module.exports = { showTouchPrompt };

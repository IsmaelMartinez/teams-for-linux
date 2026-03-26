// app/webauthn/pinDialog.js

/**
 * PIN Entry Strategies for FIDO2 Security Keys
 *
 * Two strategies for collecting the user's security key PIN, tried in order:
 *
 * Strategy A ("pre-collect"): Collect PIN upfront via a standalone BrowserWindow
 *   BEFORE spawning fido2-tools. Most robust — no race with page navigation.
 *   Uses contextIsolation: true so the PIN is never exposed to page JS.
 *
 * Strategy C ("modal-dialog"): Fallback — BrowserWindow modal attached to
 *   the parent window. Same security properties as A (isolated context).
 *   Known issue: may flash and close during page transitions.
 *
 * Strategy B ("dom-inject") was removed — it injected the PIN into the Teams
 * page DOM where contextIsolation is false, exposing it to third-party scripts.
 */

const { BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

/**
 * Strategy A: Pre-collect PIN via standalone BrowserWindow.
 * Shows an independent (non-modal) window that stays on top.
 * Called BEFORE spawning fido2-tools so there's no race.
 *
 * @param {BrowserWindow|null} parentWindow
 * @returns {Promise<string>}
 */
function requestPinPreCollect(parentWindow) {
  console.info("[WEBAUTHN:PIN] Strategy A (pre-collect): showing standalone PIN window");
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 380,
      height: 220,
      modal: false,
      frame: true,
      parent: null, // standalone, not modal — avoids parent navigation issues
      show: false,
      resizable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: "Security Key PIN — Strategy A (pre-collect)",
      webPreferences: {
        preload: path.join(__dirname, "pinDialogPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;

    const onSubmit = (_event, pin) => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      console.info("[WEBAUTHN:PIN] Strategy A: PIN submitted");
      resolve(pin);
    };

    const onCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      console.info("[WEBAUTHN:PIN] Strategy A: cancelled");
      reject(new Error("PIN entry cancelled"));
    };

    const cleanup = () => {
      ipcMain.removeListener("webauthn:pin-submit", onSubmit);
      ipcMain.removeListener("webauthn:pin-cancel", onCancel);
    };

    // Receive PIN from the PIN dialog when user submits the form
    ipcMain.on("webauthn:pin-submit", onSubmit);
    // Receive cancellation from the PIN dialog when user clicks Cancel or closes the window
    ipcMain.on("webauthn:pin-cancel", onCancel);

    win.on("closed", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("PIN entry cancelled"));
      }
    });

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
      console.info("[WEBAUTHN:PIN] Strategy A: window shown and focused");
    });
    win.loadFile(path.join(__dirname, "pinDialog.html"));
  });
}

// Strategy B (dom-inject) was removed — it injected the PIN input into the
// Teams page DOM where contextIsolation is false, exposing the PIN to any
// JavaScript running in that context (Microsoft's login scripts, etc.).

/**
 * Strategy C: Original modal BrowserWindow approach.
 * Opens a modal dialog attached to the parent window.
 * Known issue: may flash and close during page transitions.
 *
 * @param {BrowserWindow|null} parentWindow
 * @returns {Promise<string>}
 */
function requestPinModal(parentWindow) {
  console.info("[WEBAUTHN:PIN] Strategy C (modal-dialog): showing modal PIN window");
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 380,
      height: 220,
      modal: true,
      frame: true,
      parent: parentWindow,
      show: false,
      resizable: false,
      autoHideMenuBar: true,
      title: "Security Key PIN — Strategy C (modal-dialog)",
      webPreferences: {
        preload: path.join(__dirname, "pinDialogPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;

    const onSubmit = (_event, pin) => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      console.info("[WEBAUTHN:PIN] Strategy C: PIN submitted");
      resolve(pin);
    };

    const onCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      console.info("[WEBAUTHN:PIN] Strategy C: cancelled");
      reject(new Error("PIN entry cancelled"));
    };

    const cleanup = () => {
      ipcMain.removeListener("webauthn:pin-submit", onSubmit);
      ipcMain.removeListener("webauthn:pin-cancel", onCancel);
    };

    // Receive PIN from the PIN dialog when user submits the form
    ipcMain.on("webauthn:pin-submit", onSubmit);
    // Receive cancellation from the PIN dialog when user clicks Cancel or closes the window
    ipcMain.on("webauthn:pin-cancel", onCancel);

    win.on("closed", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("PIN entry cancelled"));
      }
    });

    win.once("ready-to-show", () => {
      win.show();
      console.info("[WEBAUTHN:PIN] Strategy C: modal window shown");
    });
    win.loadFile(path.join(__dirname, "pinDialog.html"));
  });
}

module.exports = { requestPinPreCollect, requestPinModal };

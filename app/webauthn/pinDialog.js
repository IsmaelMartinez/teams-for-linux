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
 * Build and show a PIN-entry BrowserWindow, wire up submit/cancel IPC, and
 * resolve with the entered PIN (or reject on cancel). Shared implementation
 * for Strategies A and C — they differ only in modality, parent attachment,
 * alwaysOnTop, and whether the window is focused after show.
 *
 * @param {object} opts
 * @param {string} opts.strategyLabel - "A" or "C"
 * @param {string} opts.strategyName - human-readable strategy name
 * @param {boolean} opts.modal - whether the window is modal to a parent
 * @param {BrowserWindow|null} opts.parent - parent window when modal
 * @param {boolean} opts.alwaysOnTop - pin the window above others
 * @param {boolean} opts.focusAfterShow - call win.focus() after ready-to-show
 * @returns {Promise<string>}
 */
function buildPinWindow({ strategyLabel, strategyName, modal, parent, alwaysOnTop, focusAfterShow }) {
  const logPrefix = `[WEBAUTHN:PIN] Strategy ${strategyLabel}`;
  console.info(`${logPrefix} (${strategyName}): showing ${modal ? "modal" : "standalone"} PIN window`);

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 380,
      height: 220,
      modal,
      frame: true,
      parent,
      show: false,
      resizable: false,
      alwaysOnTop,
      autoHideMenuBar: true,
      title: `Security Key PIN — Strategy ${strategyLabel} (${strategyName})`,
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
      console.info(`${logPrefix}: PIN submitted`);
      resolve(pin);
    };

    const onCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      console.info(`${logPrefix}: cancelled`);
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
      if (focusAfterShow) win.focus();
      console.info(`${logPrefix}: ${focusAfterShow ? "window shown and focused" : "modal window shown"}`);
    });
    win.loadFile(path.join(__dirname, "pinDialog.html"));
  });
}

/**
 * Strategy A: Pre-collect PIN via standalone BrowserWindow.
 * Shows an independent (non-modal) window that stays on top.
 * Called BEFORE spawning fido2-tools so there's no race.
 *
 * @param {BrowserWindow|null} _parentWindow - unused; kept for API symmetry with Strategy C
 * @returns {Promise<string>}
 */
function requestPinPreCollect(_parentWindow) {
  return buildPinWindow({
    strategyLabel: "A",
    strategyName: "pre-collect",
    modal: false,
    parent: null, // standalone — avoids parent navigation issues
    alwaysOnTop: true,
    focusAfterShow: true,
  });
}

/**
 * Strategy C: Original modal BrowserWindow approach.
 * Opens a modal dialog attached to the parent window.
 * Known issue: may flash and close during page transitions.
 *
 * @param {BrowserWindow|null} parentWindow
 * @returns {Promise<string>}
 */
function requestPinModal(parentWindow) {
  return buildPinWindow({
    strategyLabel: "C",
    strategyName: "modal-dialog",
    modal: true,
    parent: parentWindow,
    alwaysOnTop: false,
    focusAfterShow: false,
  });
}

module.exports = { requestPinPreCollect, requestPinModal };

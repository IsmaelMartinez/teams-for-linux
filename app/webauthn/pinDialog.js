// app/webauthn/pinDialog.js

/**
 * PIN Entry Strategies for FIDO2 Security Keys
 *
 * Three strategies for collecting the user's security key PIN, tried in order:
 *
 * Strategy A ("pre-collect"): Collect PIN upfront via a standalone BrowserWindow
 *   BEFORE spawning fido2-tools. Most robust — no race with page navigation.
 *
 * Strategy B ("dom-inject"): Inject a PIN prompt into the Teams page DOM via
 *   executeJavaScript. Survives page transitions since it lives in the existing window.
 *
 * Strategy C ("modal-dialog"): Original approach — BrowserWindow modal attached to
 *   the parent window. Opens when fido2-tools prompts for PIN on stderr.
 *   Known issue: may flash and close during page transitions.
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

/**
 * Strategy B: Collect PIN by injecting a DOM prompt into the Teams page.
 * Uses executeJavaScript to create an overlay in the main window.
 * The PIN is returned via a temporary IPC channel.
 *
 * @param {BrowserWindow|null} parentWindow
 * @returns {Promise<string>}
 */
function requestPinDomInject(parentWindow) {
  console.info("[WEBAUTHN:PIN] Strategy B (dom-inject): injecting PIN overlay into page");
  return new Promise((resolve, reject) => {
    if (!parentWindow?.webContents) {
      console.warn("[WEBAUTHN:PIN] Strategy B: no parent window, falling back");
      reject(new Error("No parent window for DOM injection"));
      return;
    }

    let settled = false;
    const nonce = Math.random().toString(36).slice(2);
    const submitChannel = `webauthn:pin-dom-submit:${nonce}`;
    const cancelChannel = `webauthn:pin-dom-cancel:${nonce}`;

    const onSubmit = (_event, pin) => {
      if (settled) return;
      settled = true;
      cleanup();
      console.info("[WEBAUTHN:PIN] Strategy B: PIN submitted via DOM");
      resolve(pin);
    };

    const onCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      console.info("[WEBAUTHN:PIN] Strategy B: cancelled via DOM");
      reject(new Error("PIN entry cancelled"));
    };

    const cleanup = () => {
      ipcMain.removeListener(submitChannel, onSubmit);
      ipcMain.removeListener(cancelChannel, onCancel);
    };

    ipcMain.on(submitChannel, onSubmit);
    ipcMain.on(cancelChannel, onCancel);

    // Build the overlay using safe DOM methods (no innerHTML — XSS prevention).
    // The injected script creates elements programmatically.
    const overlayId = `webauthn-pin-overlay-${nonce}`;
    const inputId = `webauthn-pin-input-${nonce}`;

    parentWindow.webContents.executeJavaScript(`
      (function() {
        const overlay = document.createElement('div');
        overlay.id = '${overlayId}';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';

        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:8px;padding:24px;width:340px;box-shadow:0 4px 24px rgba(0,0,0,0.3)';

        const title = document.createElement('h3');
        title.style.cssText = 'margin:0 0 8px;font-size:15px;color:#333';
        title.textContent = 'Security Key PIN \\u2014 Strategy B (dom-inject)';

        const desc = document.createElement('p');
        desc.style.cssText = 'font-size:12px;color:#666;margin:0 0 12px';
        desc.textContent = 'Enter your FIDO2 security key PIN to continue.';

        const input = document.createElement('input');
        input.type = 'password';
        input.id = '${inputId}';
        input.placeholder = 'PIN';
        input.autocomplete = 'off';
        input.style.cssText = 'width:100%;padding:8px;font-size:14px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:6px 16px;font-size:13px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#fff;color:#333';

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding:6px 16px;font-size:13px;border:1px solid #1757bd;border-radius:4px;cursor:pointer;background:#1757bd;color:#fff';

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(input);
        card.appendChild(btnRow);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        input.focus();

        function submit() {
          const pin = input.value;
          if (!pin) return;
          overlay.remove();
          require('electron').ipcRenderer.send('${submitChannel}', pin);
        }
        function cancel() {
          overlay.remove();
          require('electron').ipcRenderer.send('${cancelChannel}');
        }

        okBtn.addEventListener('click', submit);
        cancelBtn.addEventListener('click', cancel);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });

        console.info('[WEBAUTHN:PIN] Strategy B: DOM overlay injected');
      })();
    `).catch((err) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        parentWindow.webContents.executeJavaScript(`
          const el = document.getElementById('${overlayId}');
          if (el) el.remove();
        `).catch(() => {});
        reject(new Error("PIN entry timed out"));
      }
    }, 120000);
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

module.exports = { requestPinPreCollect, requestPinDomInject, requestPinModal };

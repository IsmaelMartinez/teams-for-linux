// app/_shared/securePrompt.js

/**
 * Shared hardened secret-input prompt window.
 *
 * Generalized from app/webauthn/pinDialog.js so secret-input dialogs share a
 * single audited implementation instead of diverging copies (see
 * docs-site/docs/development/research/smartcard-nss-pin-dialog-research.md).
 * The WebAuthn PIN dialog is left on its own copy for now and migrates onto
 * this helper opportunistically; no new duplicate is introduced.
 *
 * Security properties (must not regress):
 * - contextIsolation: true, sandbox: true, nodeIntegration: false
 * - the entered secret is returned only through the resolved promise; it is
 *   never logged, never written to disk, and never exposed to page JS
 * - a standalone always-on-top window survives parent navigation during auth
 *   handshakes (avoids the modal-to-a-navigating-window flash failure mode)
 *
 * Display strings (heading/message/warning/button labels) reach the renderer
 * as loadFile query parameters so they stay inside the dialog process. Never
 * pass a secret or PII through any channel other than the dialog's own window;
 * the entered secret comes back over IPC and nothing is sent the other way.
 */

const { BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

/**
 * Show a secure secret-entry prompt and resolve with the entered value.
 *
 * @param {object} opts
 * @param {string} opts.title - OS window title
 * @param {string} opts.heading - bold heading shown in the dialog
 * @param {string} opts.message - explanatory line under the heading
 * @param {string} [opts.warning] - emphasised warning line (e.g. retry/lockout notice)
 * @param {string} [opts.submitLabel] - submit button label (default "OK")
 * @param {string} [opts.cancelLabel] - cancel button label (default "Cancel")
 * @param {BrowserWindow|null} [opts.parent] - parent window; null for standalone
 * @returns {Promise<string>} resolves with the entered secret, rejects on cancel/close
 */
function showSecurePrompt({ title, heading, message, warning, submitLabel, cancelLabel, parent = null }) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 420,
      height: warning ? 280 : 240,
      modal: Boolean(parent),
      parent,
      frame: true,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title,
      webPreferences: {
        preload: path.join(__dirname, "securePromptPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;

    const cleanup = () => {
      ipcMain.removeListener("secure-prompt:submit", onSubmit);
      ipcMain.removeListener("secure-prompt:cancel", onCancel);
    };

    // event.sender scoping lets several prompts coexist on the shared channels
    // without cross-talk: each window only honours its own renderer's messages.
    const onSubmit = (event, value) => {
      if (settled || event.sender !== win.webContents) return;
      settled = true;
      cleanup();
      win.close();
      resolve(value);
    };

    const onCancel = (event) => {
      if (settled || event.sender !== win.webContents) return;
      settled = true;
      cleanup();
      win.close();
      reject(new Error("secure prompt cancelled"));
    };

    // Secret submitted from the dialog form
    ipcMain.on("secure-prompt:submit", onSubmit);
    // Dialog cancelled by the user (Cancel button)
    ipcMain.on("secure-prompt:cancel", onCancel);

    win.on("closed", () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("secure prompt cancelled"));
    });

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });

    win.loadFile(path.join(__dirname, "securePrompt.html"), {
      query: {
        heading: heading ?? "",
        message: message ?? "",
        warning: warning ?? "",
        submitLabel: submitLabel ?? "OK",
        cancelLabel: cancelLabel ?? "Cancel",
      },
    });
  });
}

module.exports = { showSecurePrompt };

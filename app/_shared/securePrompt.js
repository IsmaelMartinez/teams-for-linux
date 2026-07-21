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
 *
 * The submit/cancel IPC handlers are registered exactly once and route each
 * event to the matching prompt by the sender's webContents id. app/index.js
 * wraps ipcMain.on in a validation closure, so removeListener(originalFn) is a
 * no-op and per-invocation add/remove would leak a listener every time; the
 * register-once pattern (shared with joinMeetingDialog, login, etc.) avoids
 * that while still letting several prompts coexist without cross-talk.
 */

const { BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

// dialog webContents id -> { resolve, reject, win }
const pending = new Map();

let handlersRegistered = false;

// Settle the prompt owned by a dialog webContents. `kind` is "submit" (resolve
// with the value), "cancel" (reject), or "error" (reject with a distinct
// message so a dialog that failed to load is not reported as a user cancel).
// Idempotent: the first settle wins and later ones (e.g. the window-close that
// submit itself triggers) no-op.
function settlePrompt(senderId, kind, value) {
  const entry = pending.get(senderId);
  if (!entry) return;
  pending.delete(senderId);
  if (!entry.win.isDestroyed()) entry.win.close();
  if (kind === "submit") entry.resolve(value);
  else if (kind === "error") entry.reject(new Error("secure prompt failed to load"));
  else entry.reject(new Error("secure prompt cancelled"));
}

function ensureHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  // Secret submitted from a dialog form
  ipcMain.on("secure-prompt:submit", (event, value) => settlePrompt(event.sender.id, "submit", value));
  // Dialog cancelled by the user (Cancel button)
  ipcMain.on("secure-prompt:cancel", (event) => settlePrompt(event.sender.id, "cancel"));
}

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
  ensureHandlers();

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
      // Standalone prompts stay on top to survive auth-time navigation; a modal
      // is already constrained by its parent and alwaysOnTop can cause
      // focus-stealing on some Linux window managers, so only pin standalone.
      alwaysOnTop: !parent,
      autoHideMenuBar: true,
      title,
      webPreferences: {
        preload: path.join(__dirname, "securePromptPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const senderId = win.webContents.id;
    pending.set(senderId, { resolve, reject, win });

    win.on("closed", () => settlePrompt(senderId, "cancel"));

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });

    // A load failure must be caught here: unhandled it would reach the
    // process-wide unhandledRejection handler (which exits the app), and
    // ready-to-show would never fire, leaving the prompt pending forever.
    win
      .loadFile(path.join(__dirname, "securePrompt.html"), {
        query: {
          heading: heading ?? "",
          message: message ?? "",
          warning: warning ?? "",
          submitLabel: submitLabel ?? "OK",
          cancelLabel: cancelLabel ?? "Cancel",
        },
      })
      .catch((error) => {
        // Log only the error code: the message can embed the file path.
        console.error("[SECURE-PROMPT] Failed to load dialog", {
          errorCode: error.code ?? "unknown",
        });
        settlePrompt(senderId, "error");
      });
  });
}

module.exports = { showSecurePrompt };

// app/webauthn/touchPrompt.js

/**
 * Security Key Touch Prompt
 *
 * After the PIN dialog closes, `fido2-assert` / `fido2-cred` block on the
 * WebAuthn user-presence check: the key's LED blinks and it waits to be
 * touched. Nothing on screen says so, which is what issue #2631 reports.
 *
 * This shows a small window for the duration of the security-key call. It is
 * deliberately *not* a touch-instant signal: the fido2 tools print the PIN
 * prompt to stderr but emit nothing at the user-presence step, so the honest
 * thing to show is "waiting for your security key" across the whole call
 * rather than a message that claims to know when the LED started blinking.
 * See docs-site/docs/development/research/fido2-touch-prompt-research.md.
 *
 * The window follows pinDialog.js: a standalone, always-on-top BrowserWindow
 * with contextIsolation so the page cannot reach it.
 */

const { BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const log = require("./log");

/**
 * Show the touch prompt.
 *
 * The caller owns the returned handle and must call `dismiss()` once the
 * security-key call settles, whether it succeeded, failed, or timed out.
 *
 * @param {() => void} onCancel - Invoked once if the user cancels. The caller
 *   is expected to abort the in-flight security-key call; this module does not
 *   know how to stop it.
 * @returns {{ dismiss: () => void }}
 */
function showTouchPrompt(onCancel) {
  log.info("[WEBAUTHN:TOUCH] Showing touch prompt");

  const win = new BrowserWindow({
    width: 380,
    height: 190,
    frame: true,
    show: false,
    resizable: false,
    // Standalone rather than parented: the login page navigates during the
    // ceremony, and pinDialog.js already found that a parented window can be
    // torn down by that navigation.
    parent: null,
    modal: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    // Matches the heading: the prompt spans the whole call and does not claim
    // to know when the key's LED actually started blinking.
    title: "Waiting for your security key",
    webPreferences: {
      preload: path.join(__dirname, "touchPromptPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let settled = false;

  const cleanup = () => {
    ipcMain.removeListener("webauthn:touch-cancel", handleCancel);
  };

  // Dismissing races the user closing the window, and the parent may already
  // be gone after a 60s wait, so both paths guard on isDestroyed().
  const closeWindow = () => {
    if (!win.isDestroyed()) win.close();
  };

  function cancel() {
    if (settled) return;
    settled = true;
    cleanup();
    closeWindow();
    log.info("[WEBAUTHN:TOUCH] Cancelled by user");
    onCancel();
  }

  // `ipcMain` listeners are global, so a Cancel from one prompt would otherwise
  // abort every security-key call in flight. Only this prompt's window counts.
  function handleCancel(event) {
    if (win.isDestroyed() || event.sender !== win.webContents) return;
    cancel();
  }

  // Receive cancellation from the touch prompt when user clicks Cancel or closes the window
  ipcMain.on("webauthn:touch-cancel", handleCancel);

  // Closing the window with its titlebar means the same thing as Cancel.
  win.on("closed", cancel);

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  });
  win.loadFile(path.join(__dirname, "touchPrompt.html"));

  return {
    dismiss() {
      if (settled) return;
      settled = true;
      cleanup();
      win.removeListener("closed", cancel);
      closeWindow();
      log.debug("[WEBAUTHN:TOUCH] Prompt dismissed");
    },
  };
}

module.exports = { showTouchPrompt };

// app/webauthn/pinDialog.js

/**
 * PIN Entry Dialog for FIDO2 Security Keys
 *
 * Shows a modal dialog to collect the user's security key PIN.
 * Follows the app/login/ dialog pattern (BrowserWindow + contextBridge + HTML form).
 *
 * Microsoft Entra ID requires userVerification: "required" for FIDO2 sign-in,
 * meaning PIN entry is mandatory for security key authentication.
 */

const { BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

/**
 * Show a PIN entry dialog and return the entered PIN.
 *
 * @param {BrowserWindow|null} parentWindow - Parent window for modal attachment
 * @returns {Promise<string>} The entered PIN
 * @throws {Error} If the user cancels
 */
function requestPin(parentWindow) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 340,
      height: 200,
      modal: true,
      frame: true,
      parent: parentWindow,
      show: false,
      resizable: false,
      autoHideMenuBar: true,
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
      resolve(pin);
    };

    const onCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      reject(new Error("PIN entry cancelled"));
    };

    const cleanup = () => {
      ipcMain.removeListener("webauthn:pin-submit", onSubmit);
      ipcMain.removeListener("webauthn:pin-cancel", onCancel);
    };

    ipcMain.on("webauthn:pin-submit", onSubmit);
    ipcMain.on("webauthn:pin-cancel", onCancel);

    win.on("closed", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("PIN entry cancelled"));
      }
    });

    win.once("ready-to-show", () => win.show());
    win.loadFile(path.join(__dirname, "pinDialog.html"));
  });
}

module.exports = { requestPin };

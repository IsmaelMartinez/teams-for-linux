// app/webauthn/index.js

/**
 * WebAuthn / FIDO2 Hardware Security Key Support
 *
 * Registers IPC handlers for webauthn:create and webauthn:get channels.
 * Linux-only: on macOS/Windows, Electron's Chromium handles WebAuthn natively.
 *
 * Requires fido2-tools system package on Linux.
 */

const { BrowserWindow, ipcMain } = require("electron");
const fido2Backend = require("./fido2Backend");
const { requestPin } = require("./pinDialog");

// Defense-in-depth: only allow WebAuthn requests from known Microsoft login origins.
// The IPC allowlist is the primary control; this is a secondary check.
const ALLOWED_ORIGINS = new Set([
  "https://login.microsoftonline.com",
  "https://login.microsoft.com",
  "https://login.live.com",
]);

let initialized = false;

/**
 * Validate that the request origin is an expected Microsoft login domain.
 * @param {string} origin
 * @returns {boolean}
 */
function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin);
}

/**
 * Create a PIN callback that shows the PIN dialog attached to the sender's window.
 * @param {Electron.WebContents} sender - The webContents that sent the IPC request
 * @returns {Function} Async function that returns the PIN string
 */
function createPinCallback(sender) {
  return () => {
    const parentWindow = BrowserWindow.fromWebContents(sender);
    return requestPin(parentWindow);
  };
}

/**
 * Initialize WebAuthn IPC handlers.
 * Should only be called on Linux when auth.webauthn.enabled is true.
 */
async function initialize() {
  if (initialized) return;

  const available = await fido2Backend.isAvailable();
  if (!available) {
    console.warn("[WEBAUTHN] fido2-tools not found. Install with: sudo apt install fido2-tools");
    console.warn("[WEBAUTHN] Hardware key support will not be available");
    return;
  }

  console.info("[WEBAUTHN] fido2-tools detected, registering IPC handlers");

  // Handle credential creation requests from renderer
  ipcMain.handle("webauthn:create", async (event, options) => {
    let origin;
    try {
      origin = event.senderFrame?.origin || new URL(event.sender.getURL()).origin;
    } catch {
      console.warn("[WEBAUTHN] Blocked create request: could not determine origin");
      return { success: false, error: "SecurityError: could not determine origin" };
    }

    if (!isAllowedOrigin(origin)) {
      console.warn("[WEBAUTHN] Blocked create request from unexpected origin");
      return { success: false, error: "SecurityError: origin not allowed" };
    }

    console.debug("[WEBAUTHN] Processing create credential request");

    try {
      const pinCallback = createPinCallback(event.sender);
      const result = await fido2Backend.createCredential({ ...options, origin, pinCallback });
      return { success: true, data: result };
    } catch (err) {
      console.error("[WEBAUTHN] Create credential failed");
      return { success: false, error: err.message };
    }
  });

  // Handle assertion requests from renderer
  ipcMain.handle("webauthn:get", async (event, options) => {
    let origin;
    try {
      origin = event.senderFrame?.origin || new URL(event.sender.getURL()).origin;
    } catch {
      console.warn("[WEBAUTHN] Blocked get request: could not determine origin");
      return { success: false, error: "SecurityError: could not determine origin" };
    }

    if (!isAllowedOrigin(origin)) {
      console.warn("[WEBAUTHN] Blocked get request from unexpected origin");
      return { success: false, error: "SecurityError: origin not allowed" };
    }

    console.debug("[WEBAUTHN] Processing get assertion request");

    try {
      const pinCallback = createPinCallback(event.sender);
      const result = await fido2Backend.getAssertion({ ...options, origin, pinCallback });
      return { success: true, data: result };
    } catch (err) {
      console.error("[WEBAUTHN] Get assertion failed");
      return { success: false, error: err.message };
    }
  });

  initialized = true;
  console.info("[WEBAUTHN] Hardware security key support initialized");
}

module.exports = { initialize };

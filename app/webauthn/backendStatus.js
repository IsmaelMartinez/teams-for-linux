// app/webauthn/backendStatus.js

/**
 * Tells the renderer, before any page script runs, that no security-key
 * backend will answer a WebAuthn ceremony.
 *
 * Electron ships no WebAuthn transport on Linux (electron/electron#24573), yet
 * it still defines `window.PublicKeyCredential`. Microsoft's sign-in page then
 * offers a security key, and `navigator.credentials.get({ publicKey })` never
 * settles: the sign-in hangs for the page's 600 s timeout. That is the default
 * (auth.webauthn.enabled is false), and also the case for a login iframe when
 * fido2-tools is missing. With the flag set, the preload hides WebAuthn from
 * the page (webauthnOverride.js), so the server offers another method.
 *
 * The flag travels as a renderer command-line argument (webPreferences
 * `additionalArguments`) rather than over IPC: the config reaches the preload
 * asynchronously, after page scripts may already have probed
 * `PublicKeyCredential`, while `process.argv` is there synchronously.
 *
 * No Electron imports, so it is unit-testable and the preload can require
 * NO_BACKEND_ARG from here.
 */

const fs = require("node:fs");
const path = require("node:path");

const NO_BACKEND_ARG = "--webauthn-no-backend";

// The same three binaries fido2Backend.isAvailable() requires.
const FIDO2_TOOLS = ["fido2-cred", "fido2-assert", "fido2-token"];

/**
 * Synchronous counterpart of fido2Backend.isAvailable(): window creation
 * cannot await, and `which` is only a PATH lookup.
 * @param {string} [pathEnv] - PATH to search
 * @returns {boolean}
 */
function hasFido2Tools(pathEnv = process.env.PATH ?? "") {
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  return FIDO2_TOOLS.every((tool) =>
    dirs.some((dir) => {
      try {
        fs.accessSync(path.join(dir, tool), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    })
  );
}

/**
 * Renderer arguments for a window that loads the web app. On macOS and
 * Windows Chromium's own WebAuthn works, so nothing is hidden there.
 * @param {object} config - startup config
 * @param {{ platform?: string, toolsAvailable?: () => boolean }} [env]
 * @returns {string[]}
 */
function rendererArguments(config, { platform = process.platform, toolsAvailable = hasFido2Tools } = {}) {
  if (platform !== "linux") return [];
  if (config?.auth?.webauthn?.enabled && toolsAvailable()) return [];
  return [NO_BACKEND_ARG];
}

module.exports = { NO_BACKEND_ARG, hasFido2Tools, rendererArguments };

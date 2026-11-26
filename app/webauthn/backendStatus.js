// app/webauthn/backendStatus.js

/**
 * Tells the renderer, before any page script runs, that nothing will answer a
 * WebAuthn ceremony.
 *
 * Electron ships no WebAuthn UI on Linux (electron/electron#24573), yet it still
 * defines `window.PublicKeyCredential`. With no security key to answer,
 * `navigator.credentials.get({ publicKey })` never settles and Microsoft's
 * sign-in hangs for the page's 600 s timeout (#3204). So the preload hides
 * WebAuthn from the page (webauthnOverride.js) unless something can answer:
 * the fido2-tools backend (auth.webauthn.enabled plus the binaries on PATH), or
 * a FIDO security key plugged in, which Chromium's native WebAuthn drives over
 * hidraw with no PIN prompt of ours (#3261). The key is looked for once, when
 * the window is created, so a key plugged in later is only noticed after a
 * reload.
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

// The three binaries the fido2-tools backend runs.
const FIDO2_TOOLS = ["fido2-cred", "fido2-assert", "fido2-token"];

// HID usage page 0xF1D0 (FIDO) as a report descriptor item: Usage Page,
// 2-byte value, little-endian.
const FIDO_USAGE_PAGE_ITEM = Buffer.from([0x06, 0xd0, 0xf1]);
const HIDRAW_CLASS_DIR = "/sys/class/hidraw";

/**
 * The one availability check: the renderer gate here and
 * fido2Backend.isAvailable() both use it, so they cannot disagree.
 * Synchronous because window creation cannot await.
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
 * True when a HID report descriptor declares the FIDO usage page. A plain
 * byte search (linear), enough for the short descriptors of security keys.
 * @param {Buffer} descriptor
 * @returns {boolean}
 */
function descriptorHasFidoUsagePage(descriptor) {
  return descriptor.indexOf(FIDO_USAGE_PAGE_ITEM) !== -1;
}

/**
 * Whether a FIDO HID device (security key) is plugged in, read from the hidraw
 * report descriptors in sysfs. Synchronous because window creation cannot
 * await, and never throws: a missing /sys, unreadable files or a sandbox that
 * hides them all count as "no device".
 * @param {string} [classDir] - hidraw class directory
 * @returns {boolean}
 */
function hasFidoDevice(classDir = HIDRAW_CLASS_DIR) {
  try {
    return fs.readdirSync(classDir).some((entry) => {
      try {
        return descriptorHasFidoUsagePage(
          fs.readFileSync(path.join(classDir, entry, "device", "report_descriptor"))
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Renderer arguments for a window that loads the web app. On macOS and
 * Windows Chromium's own WebAuthn works, so nothing is hidden there.
 * @param {object} config - startup config
 * @param {{ platform?: string, toolsAvailable?: () => boolean, fidoDevicePresent?: () => boolean }} [env]
 * @returns {string[]}
 */
function rendererArguments(
  config,
  { platform = process.platform, toolsAvailable = hasFido2Tools, fidoDevicePresent = hasFidoDevice } = {}
) {
  if (platform !== "linux") return [];
  if (config?.auth?.webauthn?.enabled && toolsAvailable()) {
    console.debug("[WEBAUTHN] Renderer gate: fido2-tools backend");
    return [];
  }
  let deviceFound;
  try {
    deviceFound = fidoDevicePresent();
  } catch {
    deviceFound = false;
  }
  if (deviceFound) {
    console.info("[WEBAUTHN] Renderer gate: security key present, native WebAuthn kept");
    return [];
  }
  console.info("[WEBAUTHN] Renderer gate: no security key or backend, WebAuthn hidden");
  return [NO_BACKEND_ARG];
}

module.exports = {
  NO_BACKEND_ARG,
  descriptorHasFidoUsagePage,
  hasFido2Tools,
  hasFidoDevice,
  rendererArguments,
};

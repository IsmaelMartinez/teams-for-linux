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
 * the configured backend (auth.webauthn.enabled plus fido2-tools on PATH, or a
 * Chromium-based browser for backend "browser"), or
 * a FIDO security key plugged in, which Chromium's native WebAuthn drives over
 * hidraw with no PIN prompt of ours (#3261). The key is looked for once, when
 * the window is created, so a key plugged in later is only noticed after
 * the app is restarted (a page reload does not recompute it).
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

// Tells the preload a plugged-in key is answered by Chromium's native WebAuthn,
// so webauthnOverride must not reroute requests to IPC handlers that the main
// process only registers when the configured backend is available.
const NATIVE_ARG = "--webauthn-native";

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

// Browsers the "browser" backend (browserBackend.js) can drive, in order of
// preference. All Chromium-based: they reach a phone passkey over QR/hybrid.
const BROWSERS = [
  "google-chrome-stable",
  "google-chrome",
  "microsoft-edge-stable",
  "microsoft-edge",
  "chromium",
  "chromium-browser",
  "brave-browser",
];

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * The browser the "browser" backend runs: auth.webauthn.browserPath when set
 * (an absolute path, or a command name looked up on PATH), else the first of
 * BROWSERS on PATH. Same function for the renderer gate and the backend.
 * @param {string} [configured]
 * @param {string} [pathEnv]
 * @returns {string|null} absolute path
 */
function findBrowser(configured = "", pathEnv = process.env.PATH ?? "") {
  if (configured && path.isAbsolute(configured)) return isExecutable(configured) ? configured : null;
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const name of configured ? [configured] : BROWSERS) {
    if (name.includes("/")) continue;
    for (const dir of dirs) {
      const file = path.join(dir, name);
      if (isExecutable(file)) return file;
    }
  }
  return null;
}

/**
 * Which backend answers a ceremony: "browser" only when asked for in
 * auth.webauthn.backend, fido2-tools otherwise.
 * @param {object} config
 * @returns {"browser"|"fido2"}
 */
function backendName(config) {
  return config?.auth?.webauthn?.backend === "browser" ? "browser" : "fido2";
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
 * @param {{ platform?: string, toolsAvailable?: () => boolean, browserAvailable?: (configured: string) => boolean, fidoDevicePresent?: () => boolean, isSnap?: boolean }} [env]
 * @returns {string[]}
 */
function rendererArguments(
  config,
  {
    platform = process.platform,
    toolsAvailable = hasFido2Tools,
    browserAvailable = (configured) => findBrowser(configured) !== null,
    fidoDevicePresent = hasFidoDevice,
    isSnap = Boolean(process.env.SNAP),
  } = {}
) {
  if (platform !== "linux") return [];
  if (config?.auth?.webauthn?.enabled) {
    const backend = backendName(config);
    const available = backend === "browser"
      ? browserAvailable(config.auth.webauthn.browserPath || "")
      : toolsAvailable();
    if (available) {
      console.debug(`[WEBAUTHN] Renderer gate: ${backend === "browser" ? "browser" : "fido2-tools"} backend`);
      return [];
    }
  }
  // The snap has no hidraw or raw-usb plug, so native WebAuthn cannot reach a
  // key there even when sysfs shows one; keep hiding to avoid the #3204 hang.
  if (isSnap) {
    console.info("[WEBAUTHN] Renderer gate: snap cannot reach USB keys, WebAuthn hidden");
    return [NO_BACKEND_ARG];
  }
  let deviceFound;
  try {
    deviceFound = fidoDevicePresent();
  } catch {
    deviceFound = false;
  }
  if (deviceFound) {
    console.info("[WEBAUTHN] Renderer gate: security key present, native WebAuthn kept");
    return [NATIVE_ARG];
  }
  console.info("[WEBAUTHN] Renderer gate: no security key or backend, WebAuthn hidden");
  return [NO_BACKEND_ARG];
}

module.exports = {
  NATIVE_ARG,
  NO_BACKEND_ARG,
  backendName,
  descriptorHasFidoUsagePage,
  findBrowser,
  hasFido2Tools,
  hasFidoDevice,
  rendererArguments,
};

// app/webauthn/index.js

/**
 * WebAuthn / FIDO2 Hardware Security Key Support
 *
 * Two-layer interception:
 * Layer 1 (preload): webauthnOverride.js patches navigator.credentials in the
 *   main frame via the preload script. This works because contextIsolation is false.
 * Layer 2 (frame injection): This module injects the override into subframes
 *   (iframes) where the preload doesn't run. Microsoft's login page loads in
 *   the main frame but the WebAuthn ceremony may be triggered from a child frame.
 *   We use did-frame-finish-load + webFrameMain.executeJavaScript() following
 *   the same pattern as customCSS/index.js.
 *
 * Linux-only: on macOS/Windows, Electron's Chromium handles WebAuthn natively.
 * Requires fido2-tools system package on Linux.
 */

const { BrowserWindow, ipcMain, webFrameMain } = require("electron");
const fido2Backend = require("./fido2Backend");
const { requestPinPreCollect, requestPinModal } = require("./pinDialog");
const log = require("./log");

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
 * Collect PIN using a fallback chain of strategies.
 * Tries A (pre-collect) → C (modal-dialog). Strategy B (dom-inject) was
 * removed for security reasons (see pinDialog.js header).
 *
 * @param {Electron.WebContents} sender
 * @returns {Promise<string>}
 */
async function collectPin(sender) {
  const parentWindow = BrowserWindow.fromWebContents(sender);

  // Strategy A: standalone window, pre-collect
  try {
    return await requestPinPreCollect(parentWindow);
  } catch (error_) {
    log.warn("[WEBAUTHN:PIN] Strategy A failed", { errClass: log.classifyError(error_) });
    if (error_.message === "PIN entry cancelled") throw error_;
  }

  // Strategy B (dom-inject) was removed — PIN exposed to page JS context
  // with contextIsolation: false, making it readable by third-party scripts.

  // Strategy C: modal dialog (fallback)
  return requestPinModal(parentWindow);
}

/**
 * Handle a webauthn:create or webauthn:get IPC request.
 * Shared logic for both channels to reduce duplication.
 *
 * For operations requiring userVerification, the PIN is collected upfront
 * (Strategy A) before spawning fido2-tools, avoiding the async stderr race.
 *
 * @param {string} operation - "create" or "get"
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {object} options
 */
async function handleWebauthnRequest(operation, event, options) {
  let senderOrigin;
  try {
    senderOrigin = event.senderFrame?.origin || new URL(event.sender.getURL()).origin;
  } catch {
    log.warn("[WEBAUTHN] Blocked request", { op: operation, reason: "no-origin" });
    return { success: false, error: "SecurityError: could not determine origin" };
  }

  // A ceremony started inside a login iframe is relayed through the main frame's
  // preload, so the IPC sender is the outer frame. The key has to sign the origin
  // of the frame that actually called navigator.credentials, or the relying party
  // discards an assertion we consider successful (#2828). `frameOrigin` is the
  // browser's own MessageEvent.origin for that frame, and is held to the same
  // allowlist as the sender before anything signs it.
  const origin = options?.frameOrigin || senderOrigin;
  const relayed = origin !== senderOrigin;

  if (!isAllowedOrigin(senderOrigin) || !isAllowedOrigin(origin)) {
    log.warn("[WEBAUTHN] Blocked request", {
      op: operation,
      reason: "origin-not-allowed",
      originClass: log.classifyOrigin(origin),
    });
    return { success: false, error: "SecurityError: origin not allowed" };
  }

  // timeoutSec is the timeout the relying party asked for. It is the number that
  // tells us whether a slow ceremony (PIN entry plus waiting for the touch) can
  // realistically outlast what the page is prepared to wait for. See #2719.
  log.info("[WEBAUTHN] Processing request", {
    op: operation,
    originClass: log.classifyOrigin(origin),
    relayed,
    timeoutSec: options?.timeout ?? null,
  });

  // Phase timings, so a log shows how the wall-clock split between the user
  // typing a PIN and the key waiting to be touched, rather than leaving it to be
  // inferred from timestamps.
  const startedAt = Date.now();
  // Named touchMs, not keyMs: the log sanitizer redacts any field whose name
  // contains "key", which would blank the one number this logging exists for.
  let pinMs = null;
  let touchMs = null;

  try {
    // Determine if UV is required (PIN will be needed)
    const uvRequired = operation === "create"
      ? options.authenticatorSelection?.userVerification === "required"
      : options.userVerification === "required";

    let preCollectedPin = null;
    if (uvRequired) {
      log.info("[WEBAUTHN] userVerification=required, collecting PIN upfront");
      const pinStartedAt = Date.now();
      preCollectedPin = await collectPin(event.sender);
      pinMs = Date.now() - pinStartedAt;
      log.info("[WEBAUTHN] PIN collected, proceeding with fido2-tools");
    }

    const touchStartedAt = Date.now();
    try {
      const result = operation === "create"
        ? await fido2Backend.createCredential({ ...options, origin, topOrigin: senderOrigin, preCollectedPin })
        : await fido2Backend.getAssertion({ ...options, origin, topOrigin: senderOrigin, preCollectedPin });
      touchMs = Date.now() - touchStartedAt;
      log.info("[WEBAUTHN] Succeeded", { op: operation, totalMs: Date.now() - startedAt, pinMs, touchMs });
      return { success: true, data: result };
    } catch (err) {
      touchMs = Date.now() - touchStartedAt;
      throw err;
    }
  } catch (err) {
    log.error("[WEBAUTHN] Failed", {
      op: operation,
      errClass: log.classifyError(err),
      totalMs: Date.now() - startedAt,
      pinMs,
      touchMs,
    });
    return { success: false, error: err.message };
  }
}

/**
 * Inject the WebAuthn override into a subframe if it's a Microsoft login origin.
 * Called from did-frame-finish-load for non-main frames.
 *
 * The injected script patches navigator.credentials in the frame's context and
 * uses window.parent.postMessage to relay WebAuthn calls to the main frame,
 * where the preload's ipcRenderer forwards them to the main process.
 *
 * @param {Electron.WebFrameMain} wf - The subframe to inject into
 */
function injectIntoFrame(wf) {
  let frameOrigin;
  try {
    frameOrigin = new URL(wf.url).origin;
  } catch {
    return;
  }

  if (!isAllowedOrigin(frameOrigin)) {
    return;
  }

  log.info("[WEBAUTHN] Injecting override into login subframe", {
    originClass: log.classifyOrigin(frameOrigin),
  });

  // The injected script patches navigator.credentials in the frame and uses
  // postMessage to communicate with the parent frame (which has ipcRenderer).
  // The parent preload listens for these messages and relays them via IPC.
  wf.executeJavaScript(String.raw`
    (function() {
      if (window.__webauthnOverrideInjected) return;
      window.__webauthnOverrideInjected = true;

      if (!navigator.credentials || !navigator.credentials.create) return;

      const origCreate = navigator.credentials.create.bind(navigator.credentials);
      const origGet = navigator.credentials.get.bind(navigator.credentials);

      function bufToB64url(buf) {
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
        const CHUNK = 8192;
        let bin = "";
        for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        return btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
      }

      function b64urlToBuf(s) {
        let b = s.replace(/-/g, "+").replace(/_/g, "/");
        while (b.length % 4) b += "=";
        const d = atob(b);
        return Uint8Array.from(d, c => c.charCodeAt(0)).buffer;
      }

      function serCreate(pk) {
        return {
          challenge: bufToB64url(pk.challenge), rpId: pk.rp?.id || "", rpName: pk.rp?.name || "",
          userId: bufToB64url(pk.user?.id), userName: pk.user?.name || "",
          pubKeyCredParams: pk.pubKeyCredParams,
          timeout: pk.timeout ? Math.floor(pk.timeout/1000) : 60,
          authenticatorSelection: pk.authenticatorSelection || {},
          attestation: pk.attestation || "none",
          excludeCredentials: (pk.excludeCredentials || []).map(c => ({ id: bufToB64url(c.id), type: c.type, transports: c.transports }))
        };
      }

      function serGet(pk) {
        return {
          challenge: bufToB64url(pk.challenge), rpId: pk.rpId || "",
          timeout: pk.timeout ? Math.floor(pk.timeout/1000) : 60,
          userVerification: pk.userVerification || "preferred",
          allowCredentials: (pk.allowCredentials || []).map(c => ({ id: bufToB64url(c.id), type: c.type, transports: c.transports }))
        };
      }

      function ipcInvoke(channel, data) {
        return new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          function onMsg(e) {
            if (e.data?.type === "webauthn-response" && e.data.id === id) {
              window.removeEventListener("message", onMsg);
              if (e.data.error) reject(new DOMException(e.data.error, "NotAllowedError"));
              else resolve(e.data.result);
            }
          }
          window.addEventListener("message", onMsg);
          window.parent.postMessage({ type: "webauthn-request", id, channel, data }, "*");
          setTimeout(() => { window.removeEventListener("message", onMsg); reject(new DOMException("Timeout", "NotAllowedError")); }, 120000);
        });
      }

      navigator.credentials.create = async function(opts) {
        if (!opts?.publicKey) return origCreate(opts);
        console.info("[WEBAUTHN:frame] Intercepting credentials.create()");
        const r = await ipcInvoke("webauthn:create", serCreate(opts.publicKey));
        const raw = b64urlToBuf(r.rawId);
        return { id: r.credentialId, rawId: raw, type: r.type, authenticatorAttachment: "cross-platform",
          response: { attestationObject: b64urlToBuf(r.attestationObject), clientDataJSON: b64urlToBuf(r.clientDataJson),
            getAuthenticatorData: () => b64urlToBuf(r.authenticatorData), getTransports: () => r.transports || ["usb"],
            getPublicKey: () => null, getPublicKeyAlgorithm: () => r.publicKeyAlgorithm || -7 },
          getClientExtensionResults: () => ({}),
          toJSON: () => ({ id: r.credentialId, rawId: r.rawId, type: r.type,
            response: { attestationObject: r.attestationObject, clientDataJSON: r.clientDataJson } }) };
      };

      navigator.credentials.get = async function(opts) {
        if (!opts?.publicKey) return origGet(opts);
        if (opts.mediation === "conditional") return origGet(opts);
        console.info("[WEBAUTHN:frame] Intercepting credentials.get()");
        const r = await ipcInvoke("webauthn:get", serGet(opts.publicKey));
        const raw = b64urlToBuf(r.rawId);
        const authData = b64urlToBuf(r.authenticatorData);
        return { id: r.credentialId, rawId: raw, type: r.type, authenticatorAttachment: "cross-platform",
          response: { authenticatorData: authData, clientDataJSON: b64urlToBuf(r.clientDataJson),
            signature: b64urlToBuf(r.signature), userHandle: r.userHandle ? b64urlToBuf(r.userHandle) : null,
            getAuthenticatorData: () => authData },
          getClientExtensionResults: () => ({}),
          toJSON: () => ({ id: r.credentialId, rawId: r.rawId, type: r.type,
            authenticatorAttachment: "cross-platform", clientExtensionResults: {},
            response: { authenticatorData: r.authenticatorData, clientDataJSON: r.clientDataJson,
              signature: r.signature, userHandle: r.userHandle || null } }) };
      };

      console.info("[WEBAUTHN:frame] navigator.credentials patched in subframe");
    })();
  `).catch((err) => {
    log.error("[WEBAUTHN] Frame injection failed", { errClass: log.classifyError(err) });
  });
}

/**
 * Initialize WebAuthn IPC handlers and frame injection.
 * Should only be called on Linux when auth.webauthn.enabled is true.
 *
 * @param {Electron.BrowserWindow} [mainWindow] - Main window for frame injection
 * @param {object} [config] - App config; auth.webauthn.debug enables verbose logs
 */
async function initialize(mainWindow, config) {
  if (initialized) return;

  log.setDebug(config?.auth?.webauthn?.debug);

  const available = await fido2Backend.isAvailable();
  if (!available) {
    log.warn("[WEBAUTHN] fido2-tools not found. Install with: sudo apt install fido2-tools");
    log.warn("[WEBAUTHN] Hardware key support will not be available");
    return;
  }

  log.info("[WEBAUTHN] fido2-tools detected, registering IPC handlers");

  // Handle credential creation requests from renderer
  ipcMain.handle("webauthn:create", (event, options) => handleWebauthnRequest("create", event, options));

  // Handle assertion requests from renderer
  ipcMain.handle("webauthn:get", (event, options) => handleWebauthnRequest("get", event, options));

  // Set up postMessage relay: listen for webauthn-request messages from subframes.
  // The preload adds this listener in the main frame's context.
  // This is wired up via a message listener in the preload (see webauthnOverride.js).

  // Inject override into login subframes as they load (Layer 2).
  if (mainWindow) {
    mainWindow.webContents.on("did-frame-finish-load", (_event, isMainFrame, frameProcessId, frameRoutingId) => {
      if (isMainFrame) return;
      try {
        const wf = webFrameMain.fromId(frameProcessId, frameRoutingId);
        if (wf) injectIntoFrame(wf);
      } catch (err) {
        log.debug("[WEBAUTHN] Could not inject into frame", { errClass: log.classifyError(err) });
      }
    });
    log.info("[WEBAUTHN] Frame injection listener registered");
  }

  initialized = true;
  log.info("[WEBAUTHN] Hardware security key support initialized");
}

module.exports = { initialize };

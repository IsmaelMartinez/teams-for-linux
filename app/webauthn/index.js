/**
 * Linux WebAuthn interception for hardware keys and opt-in phone passkeys.
 * The non-isolated preload handles the main frame; injected overrides handle
 * login subframes where that preload does not run. Other platforms use Chromium.
 */

const { app, BrowserWindow, ipcMain, webFrameMain } = require("electron");
const fido2Backend = require("./fido2Backend");
const { requestPinPreCollect, requestPinModal } = require("./pinDialog");
const { showTouchPrompt } = require("./touchPrompt");
const { DEFAULT_ORIGINS, buildAllowedOrigins } = require("./originAllowlist");
const log = require("./log");

// Defense-in-depth: only allow WebAuthn requests from known login origins.
// The IPC allowlist is the primary control; this is a secondary check.
//
// Federated tenants sign in on their own IdP host, which is never one of the
// Microsoft defaults, so the ceremony was blocked outright (#2931). Extended at
// initialize() from auth.webauthn.extraOrigins. The subframe relay in
// app/browser/tools/webauthnOverride.js builds the same set.
let allowedOrigins = new Set(DEFAULT_ORIGINS);

let initialized = false;
let phoneBackend = null;

/**
 * Validate that the request origin is an allowed login origin.
 * @param {string} origin
 * @returns {boolean}
 */
function isAllowedOrigin(origin) {
  return allowedOrigins.has(origin);
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
 * Hardware requests collect the required PIN before spawning fido2-tools.
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
      hint: "if this is your federated IdP sign-in page, add it to auth.webauthn.extraOrigins",
    });
    return { success: false, error: "SecurityError: origin not allowed" };
  }

  if (phoneBackend) return phoneBackend.handle(operation, event, options);

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
    // Determine if UV is required (PIN will be needed). A get with no
    // allowCredentials also needs the PIN: the discoverable flow lists the
    // key's resident credentials via credential management, which is PIN-gated
    // on most keys regardless of what userVerification asks for.
    const uvRequired = operation === "create"
      ? options.authenticatorSelection?.userVerification === "required"
      : options.userVerification === "required";
    const discoverableGet = operation === "get" && (options.allowCredentials?.length ?? 0) === 0;

    let preCollectedPin = null;
    if (uvRequired || discoverableGet) {
      log.info("[WEBAUTHN] Collecting PIN upfront", { uvRequired, discoverableGet });
      const pinStartedAt = Date.now();
      preCollectedPin = await collectPin(event.sender);
      pinMs = Date.now() - pinStartedAt;
      log.info("[WEBAUTHN] PIN collected, proceeding with fido2-tools");
    }

    // From here the fido2 tool blocks on the user-presence check with no
    // output of its own, so the prompt spans the whole call and is dismissed
    // in `finally` on success, failure, cancel, or the backend's 60s timeout.
    const abortController = new AbortController();
    const prompt = showTouchPrompt(() => abortController.abort());
    const backendOptions = {
      ...options,
      origin,
      topOrigin: senderOrigin,
      preCollectedPin,
      abortSignal: abortController.signal,
    };

    const touchStartedAt = Date.now();
    try {
      const result = operation === "create"
        ? await fido2Backend.createCredential(backendOptions)
        : await fido2Backend.getAssertion(backendOptions);
      touchMs = Date.now() - touchStartedAt;
      log.info("[WEBAUTHN] Succeeded", { op: operation, totalMs: Date.now() - startedAt, pinMs, touchMs });
      return { success: true, data: result };
    } catch (err) {
      touchMs = Date.now() - touchStartedAt;
      throw err;
    } finally {
      prompt.dismiss();
    }
  } catch (err) {
    const timings = { totalMs: Date.now() - startedAt, pinMs, touchMs };
    // A cancel is the user's own choice, not a failure of the key.
    if (err.message === fido2Backend.CANCELLED_MESSAGE) {
      log.info("[WEBAUTHN] Cancelled by user", { op: operation, ...timings });
    } else {
      log.error("[WEBAUTHN] Failed", { op: operation, errClass: log.classifyError(err), ...timings });
    }
    return { success: false, error: err.message };
  }
}

/**
 * Inject the WebAuthn override into a subframe if it's a Microsoft login origin.
 * Called from did-frame-finish-load for non-main frames.
 *
 * The injected script patches navigator.credentials in the frame's context and
 * relays calls through the main-frame preload. Phone mode uses window.top to
 * reach it from nested frames; hardware mode retains the parent relay.
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

  wf.executeJavaScript(String.raw`
    (function() {
      if (window.__webauthnOverrideInjected) return;
      window.__webauthnOverrideInjected = true;

      if (!navigator.credentials || !navigator.credentials.create) return;

      const phone = ${Boolean(phoneBackend)};
      const relayWindow = phone ? window.top : window.parent;
      const phoneFrameId = {processId: ${wf.processId}, routingId: ${wf.routingId}};
      const permitted = () => (document.permissionsPolicy || document.featurePolicy)?.allowsFeature("publickey-credentials-get") === true;
      const origCreate = navigator.credentials.create.bind(navigator.credentials);
      const origGet = navigator.credentials.get.bind(navigator.credentials);

      function bufToB64url(buf) {
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
        const CHUNK = 8192;
        let bin = "";
        for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/={1,2}$/, "");
      }

      function b64urlToBuf(s) {
        let b = s.replace(/-/g, "+").replace(/_/g, "/");
        while (b.length % 4) b += "=";
        const d = atob(b);
        return Uint8Array.from(d, c => c.charCodeAt(0)).buffer;
      }

      function createWithPrototype(prototype, properties) {
        return Object.create(
          prototype,
          Object.getOwnPropertyDescriptors(properties)
        );
      }

      function createPublicKeyCredential(properties) {
        return createWithPrototype(PublicKeyCredential.prototype, properties);
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
          timeout: phone ? (pk.timeout ?? 60000) / 1000 : pk.timeout ? Math.floor(pk.timeout/1000) : 60,
          userVerification: pk.userVerification || "preferred",
          allowCredentials: (pk.allowCredentials || []).map(c => ({ id: bufToB64url(c.id), type: c.type, transports: c.transports }))
        };
      }

      function ipcInvoke(channel, data, signal) {
        if (phone && signal?.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
        return new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          let timer;
          const cleanup = () => { window.removeEventListener("message", onMsg); signal?.removeEventListener("abort", abort); clearTimeout(timer); };
          const send = (payload) => relayWindow.postMessage({ type: "webauthn-request", id, channel, data: payload }, "*");
          const abort = () => {
            cleanup();
            send({ cancelRequestId: id, phoneFrameId });
            reject(new DOMException("Cancelled", "AbortError"));
          };
          function onMsg(e) {
            if (e.source !== relayWindow || e.data?.type !== "webauthn-response" || e.data.id !== id) return;
            cleanup();
            if (e.data.error) {
              const name = /^(SecurityError|NotSupportedError|NotAllowedError|AbortError|InvalidStateError|OperationError|TypeError):/.exec(e.data.error)?.[1] || "NotAllowedError";
              reject(new DOMException(e.data.error, name));
            } else resolve(e.data.result);
          }
          window.addEventListener("message", onMsg);
          if (phone) signal?.addEventListener("abort", abort, {once:true});
          send(phone ? {...data, requestId:id, phoneFrameId} : data);
          timer = setTimeout(() => { cleanup(); if (phone) send({cancelRequestId:id,phoneFrameId}); reject(new DOMException("Timeout", "NotAllowedError")); }, 120000);
        });
      }

      navigator.credentials.create = async function(opts) {
        if (!opts?.publicKey || phone) return origCreate(opts);
        console.info("[WEBAUTHN:frame] Intercepting credentials.create()");
        const r = await ipcInvoke("webauthn:create", serCreate(opts.publicKey));
        const raw = b64urlToBuf(r.rawId);
        return createPublicKeyCredential({ id: r.credentialId, rawId: raw, type: r.type, authenticatorAttachment: "cross-platform",
          response: createWithPrototype(AuthenticatorAttestationResponse.prototype, {
            attestationObject: b64urlToBuf(r.attestationObject), clientDataJSON: b64urlToBuf(r.clientDataJson),
            getAuthenticatorData: () => b64urlToBuf(r.authenticatorData), getTransports: () => r.transports || ["usb"],
            getPublicKey: () => null, getPublicKeyAlgorithm: () => r.publicKeyAlgorithm || -7 }),
          getClientExtensionResults: () => ({}),
          toJSON: () => ({ id: r.credentialId, rawId: r.rawId, type: r.type,
            response: { attestationObject: r.attestationObject, clientDataJSON: r.clientDataJson } }) });
      };

      navigator.credentials.get = async function(opts) {
        if (!opts?.publicKey) return origGet(opts);
        if (opts.mediation === "conditional" || (phone && opts.mediation === "silent")) return origGet(opts);
        if (phone && !permitted()) throw new DOMException("Frame policy blocks passkeys", "SecurityError");
        console.info("[WEBAUTHN:frame] Intercepting credentials.get()");
        const r = await ipcInvoke("webauthn:get", serGet(opts.publicKey), phone ? opts.signal : undefined);
        const raw = b64urlToBuf(r.rawId);
        const authData = b64urlToBuf(r.authenticatorData);
        // The real response prototype matters: the bridge/fido login page
        // silently discards assertions failing an instanceof check (#2719).
        return createPublicKeyCredential({ id: r.credentialId, rawId: raw, type: r.type, authenticatorAttachment: "cross-platform",
          response: createWithPrototype(AuthenticatorAssertionResponse.prototype, {
            authenticatorData: authData, clientDataJSON: b64urlToBuf(r.clientDataJson),
            signature: b64urlToBuf(r.signature), userHandle: r.userHandle ? b64urlToBuf(r.userHandle) : null,
            getAuthenticatorData: () => authData }),
          getClientExtensionResults: () => ({}),
          toJSON: () => ({ id: r.credentialId, rawId: r.rawId, type: r.type,
            authenticatorAttachment: "cross-platform", clientExtensionResults: {},
            response: { authenticatorData: r.authenticatorData, clientDataJSON: r.clientDataJson,
              signature: r.signature, userHandle: r.userHandle || null } }) });
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
 *   and auth.webauthn.extraOrigins adds login origins beyond the Microsoft defaults
 */
async function initialize(mainWindow, config) {
  if (initialized) return;

  log.setDebug(config?.auth?.webauthn?.debug);
  allowedOrigins = buildAllowedOrigins(config?.auth?.webauthn?.extraOrigins);

  const phone = config?.auth?.webauthn?.backend === "phone";
  if (phone) {
    const { createPhoneBackend } = require("./phoneBackend");
    phoneBackend = createPhoneBackend({ electron: require("electron"), mainWindow,
      helperPath: config.auth.webauthn.helperPath, origins: allowedOrigins });
    app.once("before-quit", () => phoneBackend.dispose());
  } else if (!await fido2Backend.isAvailable()) {
    log.warn("[WEBAUTHN] fido2-tools not found. Install with: sudo apt install fido2-tools");
    log.warn("[WEBAUTHN] Hardware key support will not be available");
    return;
  }
  log.info("[WEBAUTHN] Registering WebAuthn handlers", { backend: phone ? "phone" : "hardware" });

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
  log.info("[WEBAUTHN] WebAuthn support initialized", {
    extraOrigins: allowedOrigins.size - DEFAULT_ORIGINS.length,
  });
}

module.exports = {
  initialize,
  _injectIntoFrame: injectIntoFrame,
  // Exported for tests: the allowlist is the security gate, so it is asserted
  // on directly rather than through a replica.
  _applyExtraOrigins: (extraOrigins) => {
    allowedOrigins = buildAllowedOrigins(extraOrigins);
  },
  _isAllowedOrigin: isAllowedOrigin,
};

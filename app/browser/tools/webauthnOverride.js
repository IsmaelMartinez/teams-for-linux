// app/browser/tools/webauthnOverride.js

/**
 * WebAuthn Override Browser Tool
 *
 * Monkey-patches navigator.credentials.create() and .get() to route
 * WebAuthn requests through IPC to the main process, which uses
 * fido2-tools for hardware security key communication.
 *
 * Linux-only: on macOS/Windows, Electron's Chromium handles WebAuthn natively.
 */

function init(config, ipcRenderer) {
  if (process.platform !== "linux") {
    return;
  }

  if (!config.auth?.webauthn?.enabled) {
    return;
  }

  if (!navigator.credentials) {
    console.warn("[WEBAUTHN] navigator.credentials not available");
    return;
  }

  const originalCreate = navigator.credentials.create.bind(navigator.credentials);
  const originalGet = navigator.credentials.get.bind(navigator.credentials);

  navigator.credentials.create = async (options) => {
    if (!options?.publicKey) {
      return originalCreate(options);
    }

    console.debug("[WEBAUTHN] Intercepting credentials.create()");

    try {
      const serialized = serializeCreateOptions(options.publicKey);
      const result = await ipcRenderer.invoke("webauthn:create", serialized);

      if (!result.success) {
        throw mapError(result.error);
      }

      return reconstructCreateResponse(result.data);
    } catch (err) {
      if (err instanceof DOMException) throw err;
      throw new DOMException(err.message, "NotAllowedError");
    }
  };

  navigator.credentials.get = async (options) => {
    if (!options?.publicKey) {
      return originalGet(options);
    }

    console.debug("[WEBAUTHN] Intercepting credentials.get()");

    try {
      const serialized = serializeGetOptions(options.publicKey);
      const result = await ipcRenderer.invoke("webauthn:get", serialized);

      if (!result.success) {
        throw mapError(result.error);
      }

      return reconstructGetResponse(result.data);
    } catch (err) {
      if (err instanceof DOMException) throw err;
      throw new DOMException(err.message, "NotAllowedError");
    }
  };

  console.info("[WEBAUTHN] navigator.credentials patched for hardware security key support");
}

/**
 * Convert ArrayBuffer/Uint8Array fields to base64url for IPC transport.
 */
// NOTE: These browser-side base64url helpers intentionally duplicate the logic
// in app/webauthn/helpers.js because the renderer uses browser APIs (btoa/atob,
// ArrayBuffer) while the main process uses Node.js Buffer. Keep both in sync.
function bufferToBase64url(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Convert base64url string to ArrayBuffer.
 */
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binStr = atob(base64);
  const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function serializeCreateOptions(publicKey) {
  return {
    challenge: bufferToBase64url(publicKey.challenge),
    rpId: publicKey.rp?.id || "",
    rpName: publicKey.rp?.name || "",
    userId: bufferToBase64url(publicKey.user?.id),
    userName: publicKey.user?.name || "",
    userDisplayName: publicKey.user?.displayName || "",
    pubKeyCredParams: publicKey.pubKeyCredParams,
    timeout: publicKey.timeout ? Math.floor(publicKey.timeout / 1000) : 60,
    authenticatorSelection: publicKey.authenticatorSelection || {},
    attestation: publicKey.attestation || "none",
    excludeCredentials: (publicKey.excludeCredentials || []).map((c) => ({
      id: bufferToBase64url(c.id),
      type: c.type,
      transports: c.transports,
    })),
  };
}

function serializeGetOptions(publicKey) {
  return {
    challenge: bufferToBase64url(publicKey.challenge),
    rpId: publicKey.rpId || "",
    timeout: publicKey.timeout ? Math.floor(publicKey.timeout / 1000) : 60,
    userVerification: publicKey.userVerification || "preferred",
    allowCredentials: (publicKey.allowCredentials || []).map((c) => ({
      id: bufferToBase64url(c.id),
      type: c.type,
      transports: c.transports,
    })),
  };
}

/**
 * Reconstruct a PublicKeyCredential-shaped object from IPC response.
 * We cannot create real PublicKeyCredential instances, but the shape
 * is sufficient for login.microsoftonline.com's JavaScript to process.
 */
function reconstructCreateResponse(data) {
  const rawId = base64urlToBuffer(data.rawId);
  return {
    id: data.credentialId,
    rawId: rawId,
    type: data.type,
    authenticatorAttachment: "cross-platform",
    response: {
      attestationObject: base64urlToBuffer(data.attestationObject),
      clientDataJSON: base64urlToBuffer(data.clientDataJson),
      getAuthenticatorData: () => base64urlToBuffer(data.authenticatorData),
      getTransports: () => data.transports || ["usb"],
      getPublicKey: () => null,
      getPublicKeyAlgorithm: () => data.publicKeyAlgorithm || -7,
    },
    getClientExtensionResults: () => ({}),
    toJSON: () => ({
      id: data.credentialId,
      rawId: data.rawId,
      type: data.type,
      response: {
        attestationObject: data.attestationObject,
        clientDataJSON: data.clientDataJson,
      },
    }),
  };
}

function reconstructGetResponse(data) {
  const rawId = base64urlToBuffer(data.rawId);
  return {
    id: data.credentialId,
    rawId: rawId,
    type: data.type,
    authenticatorAttachment: "cross-platform",
    response: {
      authenticatorData: base64urlToBuffer(data.authenticatorData),
      clientDataJSON: base64urlToBuffer(data.clientDataJson),
      signature: base64urlToBuffer(data.signature),
      userHandle: data.userHandle ? base64urlToBuffer(data.userHandle) : null,
    },
    getClientExtensionResults: () => ({}),
    toJSON: () => ({
      id: data.credentialId,
      rawId: data.rawId,
      type: data.type,
      response: {
        authenticatorData: data.authenticatorData,
        clientDataJSON: data.clientDataJson,
        signature: data.signature,
        userHandle: data.userHandle,
      },
    }),
  };
}

/**
 * Map error strings to appropriate DOMExceptions.
 */
function mapError(errorMessage) {
  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("notallowederror") || msg.includes("no fido2")) {
    return new DOMException(errorMessage, "NotAllowedError");
  }
  if (msg.includes("invaliderror") || msg.includes("invalid")) {
    return new DOMException(errorMessage, "InvalidStateError");
  }
  if (msg.includes("securityerror")) {
    return new DOMException(errorMessage, "SecurityError");
  }
  return new DOMException(errorMessage, "NotAllowedError");
}

module.exports = { init };

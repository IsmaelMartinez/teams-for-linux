const fs = require("node:fs");
const path = require("node:path");
const { runBackend } = require("./phoneHelper");

function available(helperPath) {
  if (!path.isAbsolute(helperPath || "")) return false;
  try {
    fs.accessSync(helperPath, fs.constants.X_OK);
    return fs.statSync(helperPath).isFile();
  } catch {
    return false;
  }
}

function createPhoneBackend({ electron, helperPath, mainWindow, origins }) {
  const active = new Map();
  const sender = mainWindow?.webContents;
  const unavailable = () => ({ success: false, error: "NotSupportedError: Configure an executable phone-passkey helper using an absolute path." });

  function caller(event, options) {
    if (!sender || event.sender !== sender || sender.isDestroyed()) throw new Error("Unregistered window.");
    let frame = event.senderFrame;
    if (options.phoneFrameId) {
      frame = sender.mainFrame.framesInSubtree.find((candidate) =>
        candidate.processId === options.phoneFrameId.processId && candidate.routingId === options.phoneFrameId.routingId);
    }
    if (!frame || frame.detached) throw new Error("Detached frame.");
    const origin = new URL(frame.url).origin;
    if (!origins.has(origin) || (options.frameOrigin && options.frameOrigin !== origin)) throw new Error("Origin mismatch.");
    let crossOrigin = false;
    for (let parent = frame.parent; parent; parent = parent.parent) {
      const parentOrigin = new URL(parent.url).origin;
      if (!parentOrigin.startsWith("https://")) throw new Error("Insecure ancestor.");
      crossOrigin ||= parentOrigin !== origin;
    }
    return { frame, origin, topOrigin: crossOrigin ? new URL(frame.top.url).origin : undefined };
  }

  async function handle(operation, event, options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      return { success: false, error: "TypeError: Invalid phone passkey request." };
    }
    let context;
    try {
      context = caller(event, options || {});
    } catch {
      return { success: false, error: "SecurityError: This phone sign-in frame is not allowed." };
    }
    const frameKey = `${context.frame.processId}:${context.frame.routingId}`;
    if (options.cancelRequestId) {
      const pending = active.get(frameKey);
      if (pending?.id === options.cancelRequestId) pending.controller.abort();
      return { success: true };
    }
    if (operation !== "get") return { success: false, error: "NotSupportedError: Phone passkey registration is not supported." };
    if (!available(helperPath)) return unavailable();
    const requestedTimeout = options.timeout ?? 60;
    if (typeof requestedTimeout !== "number" || !Number.isFinite(requestedTimeout) || requestedTimeout <= 0) {
      return { success: false, error: "TypeError: Invalid phone passkey request." };
    }
    const timeout = Math.min(requestedTimeout * 1000, 120000);
    let requestBytes;
    try {
      requestBytes = Buffer.byteLength(JSON.stringify(options));
    } catch {
      return { success: false, error: "TypeError: Invalid phone passkey request." };
    }
    if (!Number.isFinite(timeout) || timeout <= 0 || typeof options.requestId !== "string" ||
        !options.requestId.length || options.requestId.length > 128 ||
        typeof options.challenge !== "string" || !/^[A-Za-z0-9_-]+$/.test(options.challenge) ||
        options.challenge.length > 65536 || requestBytes > 1024 * 1024) {
      return { success: false, error: "TypeError: Invalid phone passkey request." };
    }
    if (active.has(frameKey)) return { success: false, error: "InvalidStateError: A phone sign-in is already in progress." };
    const controller = new AbortController();
    const pending = { id: options.requestId, frame: context.frame, controller };
    active.set(frameKey, pending);
    let prompt;
    async function showQr(svg) {
      if (prompt || controller.signal.aborted) return;
      try {
        prompt = new electron.BrowserWindow({
          width: 430, height: 620, show: false, resizable: false, autoHideMenuBar: true,
          title: "Sign in with your phone",
          backgroundColor: electron.nativeTheme?.shouldUseDarkColors ? "#1e1f22" : "#ffffff",
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false,
            partition: "phone-passkey-prompt", preload: path.join(__dirname, "phonePromptPreload.js") },
        });
        prompt.setMenu(null);
        prompt.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        prompt.webContents.on("will-navigate", (event) => event.preventDefault());
        prompt.on("closed", () => controller.abort());
        await prompt.loadFile(path.join(__dirname, "phonePrompt.html"));
        if (controller.signal.aborted || prompt.isDestroyed()) return;
        await prompt.webContents.executeJavaScript(`document.getElementById("origin").textContent = ${JSON.stringify(context.origin)};
          document.getElementById("qr").src = ${JSON.stringify(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`)};`);
        if (!controller.signal.aborted && !prompt.isDestroyed()) prompt.show();
      } catch {
        controller.abort();
      }
    }
    try {
      const publicKey = { challenge: options.challenge, rpId: options.rpId || new URL(context.origin).hostname,
        timeout, userVerification: options.userVerification || "preferred", allowCredentials: options.allowCredentials || [] };
      const result = await runBackend({ helperPath, timeout, signal: controller.signal,
        request: { origin: context.origin, topOrigin: context.topOrigin, publicKey }, onQr: (svg) => { void showQr(svg); } });
      const current = caller(event, options);
      if (current.origin !== context.origin || current.topOrigin !== context.topOrigin || controller.signal.aborted) {
        throw Object.assign(new Error("The sign-in page changed."), { name: "AbortError" });
      }
      const response = result.response;
      const fields = [result.id, result.rawId, response.clientDataJSON, response.authenticatorData, response.signature];
      if (fields.some((field) => typeof field !== "string" || !/^[A-Za-z0-9_-]+$/.test(field)) ||
          (response.userHandle != null && (typeof response.userHandle !== "string" || !/^[A-Za-z0-9_-]+$/.test(response.userHandle)))) {
        throw Object.assign(new Error("Invalid authentication helper response."), { name: "OperationError" });
      }
      let client;
      try {
        client = JSON.parse(Buffer.from(response.clientDataJSON, "base64url"));
      } catch {
        throw Object.assign(new Error("Invalid authentication helper response."), { name: "OperationError" });
      }
      if (client.type !== "webauthn.get" || client.challenge !== options.challenge ||
          client.origin !== context.origin || client.crossOrigin !== Boolean(context.topOrigin) ||
          client.topOrigin !== context.topOrigin) {
        throw Object.assign(new Error("The authentication response belongs to another request."), { name: "SecurityError" });
      }
      return { success: true, data: { credentialId: result.id, rawId: result.rawId, type: "public-key",
        clientDataJson: response.clientDataJSON, authenticatorData: response.authenticatorData,
        signature: response.signature, userHandle: response.userHandle || null } };
    } catch (error) {
      return { success: false, error: `${error.name}: ${error.message}` };
    } finally {
      active.delete(frameKey);
      if (prompt && !prompt.isDestroyed()) prompt.destroy();
    }
  }

  const abortAll = () => { for (const pending of active.values()) pending.controller.abort(); };
  const onNavigation = (_event, _url, inPlace, isMainFrame, processId, routingId) => {
    if (inPlace) return;
    for (const pending of active.values()) {
      if (isMainFrame || (pending.frame.processId === processId && pending.frame.routingId === routingId)) pending.controller.abort();
    }
  };
  sender?.on("did-start-navigation", onNavigation);
  sender?.on("render-process-gone", abortAll);
  sender?.on("destroyed", abortAll);
  return { handle, dispose() {
    abortAll();
    sender?.removeListener("did-start-navigation", onNavigation);
    sender?.removeListener("render-process-gone", abortAll);
    sender?.removeListener("destroyed", abortAll);
  } };
}

module.exports = { available, createPhoneBackend };

// app/webauthn/browserBackend.js

/**
 * Browser backend: a real Chromium browser answers the WebAuthn ceremony.
 *
 * Electron on Linux cannot reach a phone passkey (the QR / hybrid flow,
 * electron/electron#24573), and fido2-tools only talks to USB keys. Chrome, Edge,
 * Chromium, Brave and Vivaldi do reach the phone, so for an assertion this backend:
 *
 * 1. starts the browser with a throwaway empty profile, driven over
 *    --remote-debugging-pipe (a private pipe, no network port);
 * 2. opens a static page on the requesting origin, Microsoft's public sign-in
 *    metadata (JSON: no page scripts run, the empty profile sends no cookies).
 *    It has to be a real HTTPS load: a page made up through the DevTools
 *    protocol counts as a certificate error, and WebAuthn refuses it;
 * 3. calls navigator.credentials.get() there with the page's own challenge
 *    and options. The browser shows its own dialog, with the QR code, and the
 *    phone signs;
 * 4. returns the assertion in the shape fido2Backend.getAssertion() returns.
 *
 * The clientDataJSON is the browser's own, so it names the same origin a
 * browser sign-in would. Registration (create) is not offered: passkeys are
 * registered in a browser, on the account's Security info page.
 *
 * No Electron imports, so it is unit-testable.
 */

const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const { findBrowser } = require("./backendStatus");
const { CANCELLED_MESSAGE } = require("./fido2Backend");
const log = require("./log");

// Static same-origin pages per login host. Each answers 200 with JSON and no
// redirect (checked 2026-11-25). A 404 is no use: Chromium swaps in its own
// error page, whose origin is opaque.
const METADATA_PAGES = {
  "https://login.microsoftonline.com": "/common/v2.0/.well-known/openid-configuration",
  "https://login.microsoft.com": "/common/v2.0/.well-known/openid-configuration",
  "https://login.live.com": "/.well-known/openid-configuration",
};

const BUSY_MESSAGE = "NotAllowedError: a passkey request is already open in the browser window";

let busy = false;

/**
 * The page to run the ceremony in, for an exact https origin (scheme, host,
 * optional port; no credentials or path). Other origins
 * (auth.webauthn.extraOrigins) get their root page; getAssertion() checks the
 * origin after loading. The URL becomes a browser command-line argument, so
 * anything that is not a plain https origin is refused here.
 * @param {string} origin
 * @returns {string}
 * @throws {Error} SecurityError for anything but an exact https origin
 */
function metadataPageUrl(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || url.origin !== origin) {
    throw new Error("SecurityError: the browser passkey backend only serves exact https origins");
  }
  return new URL(METADATA_PAGES[url.origin] ?? "/", url.origin).href;
}

/**
 * The script run in the browser page. Options are embedded as JSON, never
 * concatenated as code.
 * @param {object} options - serialized get options from the renderer
 * @returns {string}
 */
function buildGetScript(options) {
  const request = {
    challenge: options.challenge,
    rpId: options.rpId || undefined,
    userVerification: options.userVerification || "preferred",
    timeoutMs: (options.timeout || 60) * 1000,
    allowCredentials: (options.allowCredentials || []).map((c) => ({
      id: c.id,
      type: c.type || "public-key",
      ...(c.transports ? { transports: c.transports } : {}),
    })),
  };
  return String.raw`(async () => {
  const req = ${JSON.stringify(request)};
  const dec = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const enc = (b) => {
    const bytes = new Uint8Array(b);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  try {
    const publicKey = {
      challenge: dec(req.challenge),
      userVerification: req.userVerification,
      timeout: req.timeoutMs,
      allowCredentials: req.allowCredentials.map((c) => ({ ...c, id: dec(c.id) })),
    };
    if (req.rpId) publicKey.rpId = req.rpId;
    const cred = await navigator.credentials.get({ publicKey });
    const r = cred.response;
    return {
      ok: true,
      credentialId: cred.id,
      rawId: enc(cred.rawId),
      type: cred.type,
      attachment: cred.authenticatorAttachment,
      authenticatorData: enc(r.authenticatorData),
      clientDataJson: enc(r.clientDataJSON),
      signature: enc(r.signature),
      userHandle: r.userHandle ? enc(r.userHandle) : null,
    };
  } catch (e) {
    return { ok: false, name: e.name, message: e.message };
  }
})()`;
}

/**
 * Chrome DevTools Protocol over --remote-debugging-pipe: the browser reads
 * commands on fd 3 and writes replies and events on fd 4, NUL-separated JSON.
 */
class CdpPipe extends EventEmitter {
  #out;
  #nextId = 0;
  #pending = new Map();
  #buffer = "";

  constructor(child) {
    super();
    this.#out = child.stdio[3];
    child.stdio[4].on("data", (chunk) => this.#onData(chunk));
    // A write after the browser died must not crash the main process.
    this.#out.on("error", () => {});
    child.once("exit", () => {
      for (const { reject } of this.#pending.values()) reject(new Error("NotAllowedError: the browser closed"));
      this.#pending.clear();
      this.emit("closed");
    });
  }

  #onData(chunk) {
    this.#buffer += chunk.toString("utf8");
    let end;
    while ((end = this.#buffer.indexOf("\0")) !== -1) {
      const raw = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 1);
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }
      if (msg.id && this.#pending.has(msg.id)) {
        const { resolve, reject, method } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result ?? {});
      } else if (msg.method) {
        this.emit("event", msg);
      }
    }
  }

  call(method, params = {}, sessionId = undefined, timeoutMs = 20_000) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`NotAllowedError: the browser did not answer ${method} (timeout)`));
      }, timeoutMs);
      this.#pending.set(id, {
        method,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.#out.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
    });
  }
}

/**
 * Wait for the browser's first page target and attach to it.
 * @param {CdpPipe} cdp
 * @returns {Promise<string>} session id
 */
async function attachToPage(cdp) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { targetInfos = [] } = await cdp.call("Target.getTargets", {}, undefined, 30_000);
    const page = targetInfos.find((t) => t.type === "page");
    if (page) {
      const { sessionId } = await cdp.call("Target.attachToTarget", { targetId: page.targetId, flatten: true });
      return sessionId;
    }
    await sleep(200);
  }
  throw new Error("NotAllowedError: the browser opened no page (timeout)");
}

/**
 * Wait until the page has loaded on the expected origin, as a secure context.
 * @param {CdpPipe} cdp
 * @param {string} sessionId
 * @param {string} origin
 */
async function waitForOrigin(cdp, sessionId, origin) {
  const deadline = Date.now() + 30_000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const { result } = await cdp.call("Runtime.evaluate", {
        expression: "JSON.stringify([document.readyState, location.origin, isSecureContext])",
        returnByValue: true,
      }, sessionId);
      last = JSON.parse(result.value);
      if (last[0] === "complete" && last[1] === origin && last[2] === true) return;
      // Loaded somewhere else (a redirect): waiting won't fix it.
      if (last[0] === "complete" && last[1] !== "null" && last[1] !== origin) break;
    } catch {
      // The page is still navigating: the evaluate lands in a context about to go away.
    }
    await sleep(250);
  }
  log.warn("[WEBAUTHN:browser] Page not on the requesting origin", {
    state: last?.[0] ?? null,
    secure: last?.[2] ?? null,
    sameOrigin: last ? last[1] === origin : null,
  });
  throw new Error("NotSupportedError: the browser could not open a page on the sign-in origin");
}

/**
 * Get an assertion through a real browser.
 *
 * @param {object} options - serialized get options (see fido2Backend.getAssertion), plus
 * @param {string} options.origin - origin of the frame that called navigator.credentials.get()
 * @param {AbortSignal} [options.abortSignal] - aborts the ceremony and closes the browser
 * @param {object} [env]
 * @param {string} [env.browserPath] - auth.webauthn.browserPath
 * @param {boolean} [env.headless] - tests only
 * @param {(cdp: CdpPipe, sessionId: string) => Promise<void>} [env.beforeGet] - tests only
 * @returns {Promise<object>} assertion, same shape as fido2Backend.getAssertion()
 */
async function getAssertion(options, { browserPath = "", headless = false, beforeGet = null, tmpDir = os.tmpdir() } = {}) {
  if (busy) throw new Error(BUSY_MESSAGE);
  const browser = findBrowser(browserPath);
  if (!browser) throw new Error("NotSupportedError: no Chrome, Edge, Chromium, Brave or Vivaldi found for the browser passkey backend");
  // The caller checks the origin against the login allowlist; it is checked
  // again here because it becomes part of the browser's command line.
  const pageUrl = metadataPageUrl(options.origin);
  options.abortSignal?.throwIfAborted?.();

  busy = true;
  let profile = null;
  let child = null;
  let cdp = null;
  let closed = null;
  const startedAt = Date.now();
  try {
    profile = fs.mkdtempSync(path.join(tmpDir, "tfl-passkey-"));
    const args = [
      "--remote-debugging-pipe",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--password-store=basic",
      "--window-size=560,640",
      ...(headless ? ["--headless=new"] : []),
      `--app=${pageUrl}`,
    ];
    child = spawn(browser, args, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    cdp = new CdpPipe(child);
    closed = new Promise((resolve) => child.once("exit", resolve));
    const spawnFailed = new Promise((_, reject) =>
      child.once("error", () => reject(new Error("NotSupportedError: the browser for the passkey backend did not start"))));
    const aborted = new Promise((_, reject) => {
      options.abortSignal?.addEventListener("abort", () => reject(new Error(CANCELLED_MESSAGE)), { once: true });
    });
    // Closing the browser window is the user's cancel.
    const windowClosed = closed.then(() => { throw new Error(CANCELLED_MESSAGE); });
    // Only one of these settles the race; the others may reject later (the
    // window closing in `finally` does, every time) and must not surface as
    // unhandled rejections in the main process.
    for (const p of [spawnFailed, aborted, windowClosed]) p.catch(() => {});

    log.info("[WEBAUTHN:browser] Started browser", {
      browser: path.basename(browser),
      knownPage: options.origin in METADATA_PAGES,
      credCount: options.allowCredentials?.length || 0,
    });

    const ceremony = (async () => {
      const sessionId = await attachToPage(cdp);
      await waitForOrigin(cdp, sessionId, options.origin);
      await cdp.call("Page.bringToFront", {}, sessionId);
      // WebAuthn refuses a document without focus; the window may not have it yet.
      await cdp.call("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
      if (beforeGet) await beforeGet(cdp, sessionId);
      const timeoutMs = (options.timeout || 60) * 1000 + 30_000;
      const reply = await cdp.call("Runtime.evaluate", {
        expression: buildGetScript(options),
        awaitPromise: true,
        userGesture: true,
        returnByValue: true,
      }, sessionId, timeoutMs);
      const value = reply.result?.value;
      if (!value) throw new Error("NotAllowedError: no answer from the browser page");
      if (!value.ok) throw new Error(`${value.name || "NotAllowedError"}: ${value.message || "passkey request failed"}`);
      return value;
    })();
    ceremony.catch(() => {});
    const value = await Promise.race([ceremony, aborted, windowClosed, spawnFailed]);
    log.info("[WEBAUTHN:browser] Assertion received", {
      attachment: value.attachment ?? null,
      hasUserHandle: !!value.userHandle,
      elapsedMs: Date.now() - startedAt,
    });
    return {
      credentialId: value.credentialId,
      rawId: value.rawId,
      authenticatorData: value.authenticatorData,
      clientDataJson: value.clientDataJson,
      signature: value.signature,
      userHandle: value.userHandle,
      type: value.type || "public-key",
    };
  } finally {
    // Each step guarded on its own, and `busy` reset last whatever failed:
    // a request left marked open would refuse every later sign-in.
    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        cdp.call("Browser.close", {}, undefined, 3_000).catch(() => {});
        const exited = await Promise.race([closed.then(() => true), sleep(5_000).then(() => false)]);
        if (!exited) child.kill("SIGKILL");
      }
    } catch (err) {
      log.warn("[WEBAUTHN:browser] Could not close the browser", { errClass: log.classifyError(err) });
    }
    try {
      if (profile) fs.rmSync(profile, { recursive: true, force: true });
    } catch (err) {
      log.warn("[WEBAUTHN:browser] Could not remove the temporary profile", { errClass: log.classifyError(err) });
    }
    busy = false;
  }
}

module.exports = { getAssertion, metadataPageUrl, BUSY_MESSAGE };
module.exports._buildGetScript = buildGetScript;

// app/security/ipcSecurity.js

/**
 * IPC registration hardening.
 *
 * Wraps ipcMain's registration methods so every renderer-initiated call is
 * checked against the allowlist in ipcValidator.js before the real handler
 * runs. This is a compensating control for the disabled contextIsolation and
 * sandbox on the Teams window.
 *
 * Because the wrapper is what actually gets registered, removal has to be
 * wrapped too: `removeListener(channel, fn)` matches by identity and would
 * never find `fn`, so every listener registered through `ipcMain.on` would
 * stay for the life of the process. Callers that register per short-lived
 * window — `webauthn/pinDialog.js`, `webauthn/touchPrompt.js` — leak one
 * listener per ceremony, each retaining a destroyed BrowserWindow, and Node
 * prints MaxListenersExceededWarning at the eleventh.
 */

const { validateIpcChannel, isSenderAllowed } = require("./ipcValidator");

/**
 * Install the allowlist check on an ipcMain-like emitter.
 *
 * Idempotent only in the sense that it is meant to be called once during
 * startup; calling it twice would double-wrap every registration.
 *
 * @param {import("electron").IpcMain} ipcMain
 * @param {{ error: Function, warn: Function }} [logger] - defaults to console
 * @param {(url: string) => boolean} [isTrustedPage] - the rule for channels
 *   that answer trusted web pages (see ipcValidator.js); resolved on every
 *   message, so it may read state that appears after installation. Without it
 *   only the static rule applies.
 */
function installIpcSecurity(ipcMain, logger = console, isTrustedPage = undefined) {
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalRemoveListener = ipcMain.removeListener.bind(ipcMain);
  const originalRemoveAllListeners = ipcMain.removeAllListeners.bind(ipcMain);

  // handler -> channel -> wrappers registered for it. Weak on the handler so a
  // listener that goes out of scope takes its bookkeeping with it.
  const wrappers = new WeakMap();

  // `removeAllListeners` empties the emitter without naming the handlers it
  // dropped, and a WeakMap cannot be walked to find them. So every wrapper is
  // stamped with a registration number, and a clear records the number it
  // happened at: anything stamped at or below that is gone from the emitter.
  let registrations = 0;
  let clearedAll = 0;
  const clearedByChannel = new Map();

  const isLive = (channel, entry) =>
    entry.at > clearedAll && entry.at > (clearedByChannel.get(channel) ?? 0);

  function remember(channel, handler, wrapper) {
    let byChannel = wrappers.get(handler);
    if (!byChannel) {
      byChannel = new Map();
      wrappers.set(handler, byChannel);
    }
    const entry = { wrapper, at: ++registrations };
    const existing = byChannel.get(channel);
    if (existing) existing.push(entry);
    else byChannel.set(channel, [entry]);
    return entry;
  }

  // EventEmitter.removeListener drops the most recently added match, so pop to
  // match it. Falling back to the handler itself keeps removal working for
  // listeners that were registered before this wrapping was installed.
  function forget(channel, handler) {
    const registered = wrappers.get(handler)?.get(channel);
    if (!registered) return handler;
    // Drop anything a removeAllListeners already took off the emitter, so the
    // pop below returns a wrapper that is really still registered.
    while (registered.length && !isLive(channel, registered.at(-1))) registered.pop();
    return registered.length ? registered.pop().wrapper : handler;
  }

  // A fired `once` has to drop its own record, not the newest one: registering
  // the same function with `on` after the `once` would otherwise make the
  // `once` consume the `on`'s record, and the `on` could never be removed.
  function forgetEntry(channel, handler, entry) {
    const registered = wrappers.get(handler)?.get(channel);
    const index = registered ? registered.indexOf(entry) : -1;
    if (index !== -1) registered.splice(index, 1);
  }

  // Channel -> number of sender refusals. Refusals are routine on a sign-in
  // page (the preload's tools still call their channels there), so only the
  // first one per channel is logged and the rest are counted silently.
  const senderRefusals = new Map();

  // A scheme only: the host of a sign-in page identifies the user's employer.
  function senderScheme(event) {
    try {
      return new URL(event.senderFrame.url).protocol.slice(0, -1);
    } catch {
      return "unknown";
    }
  }

  function noteSenderRefusal(channel, kind, event) {
    const count = senderRefusals.get(channel) ?? 0;
    senderRefusals.set(channel, count + 1);
    if (count === 0) {
      logger.warn(`[IPC Security] Rejected ${kind} from an untrusted sender for channel: ${channel}`, {
        scheme: senderScheme(event),
      });
    }
  }

  function isAllowed(channel, event, args, kind) {
    if (!validateIpcChannel(channel, args.length > 0 ? args[0] : null)) {
      logger.error(`[IPC Security] Rejected ${kind} for channel: ${channel}`);
      return false;
    }
    if (!isSenderAllowed(channel, event, isTrustedPage)) {
      noteSenderRefusal(channel, kind, event);
      return false;
    }
    return true;
  }

  // An event listener has no caller to report to, so anything it throws (or a
  // promise it returns that rejects) would reach the process-wide handlers in
  // app/index.js, which exit the app. A renderer message with an unexpected
  // shape must not be able to do that, so the failure is logged and dropped.
  // `handle` needs none of this: Electron sends a rejection back to the caller.
  // Only the error's name and code are logged: a message or stack can carry
  // file paths (and so the OS user name) or data taken from the payload.
  function reportListenerError(channel, error) {
    logger.error(`[IPC Security] Listener failed for channel: ${channel}`, {
      name: error instanceof Error ? error.name : typeof error,
      code: typeof error?.code === "string" ? error.code : undefined,
    });
  }

  function runListener(channel, handler, event, args) {
    try {
      const result = handler(event, ...args);
      if (typeof result?.catch === "function") {
        result.catch((error) => reportListenerError(channel, error));
      }
      return result;
    } catch (error) {
      reportListenerError(channel, error);
      return undefined;
    }
  }

  ipcMain.handle = (channel, handler) => {
    return originalHandle(channel, (event, ...args) => {
      if (!isAllowed(channel, event, args, "handle request")) {
        return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
      }
      return handler(event, ...args);
    });
  };

  ipcMain.on = (channel, handler) => {
    const entry = remember(channel, handler, (event, ...args) => {
      if (!isAllowed(channel, event, args, "event")) return;
      return runListener(channel, handler, event, args);
    });
    return originalOn(channel, entry.wrapper);
  };

  // Registered with the original `on` and removed by hand on the first allowed
  // event. The emitter's own `once` registers through the wrapped `on` above,
  // which stores a second wrapper that removeListener(channel, handler) can
  // never find, so a once() removed before it fired stayed registered.
  ipcMain.once = (channel, handler) => {
    const entry = remember(channel, handler, (event, ...args) => {
      if (!isAllowed(channel, event, args, "event")) return;
      originalRemoveListener(channel, entry.wrapper);
      forgetEntry(channel, handler, entry);
      return runListener(channel, handler, event, args);
    });
    return originalOn(channel, entry.wrapper);
  };

  ipcMain.removeListener = (channel, handler) => {
    return originalRemoveListener(channel, forget(channel, handler));
  };

  // `off` is EventEmitter's alias for removeListener; keep them the same.
  ipcMain.off = ipcMain.removeListener;

  // Rest args rather than a named one: EventEmitter branches on
  // `arguments.length`, so forwarding an explicit `undefined` would clear
  // nothing instead of clearing everything.
  ipcMain.removeAllListeners = (...args) => {
    if (args.length === 0) {
      clearedAll = registrations;
      clearedByChannel.clear();
    } else {
      clearedByChannel.set(args[0], registrations);
    }
    return originalRemoveAllListeners(...args);
  };
}

module.exports = { installIpcSecurity };

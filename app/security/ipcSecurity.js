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

const { validateIpcChannel } = require("./ipcValidator");

/**
 * Install the allowlist check on an ipcMain-like emitter.
 *
 * Idempotent only in the sense that it is meant to be called once during
 * startup; calling it twice would double-wrap every registration.
 *
 * @param {import("electron").IpcMain} ipcMain
 * @param {{ error: Function }} [logger] - defaults to console
 */
function installIpcSecurity(ipcMain, logger = console) {
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalOnce = ipcMain.once.bind(ipcMain);
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

  function isAllowed(channel, args, kind) {
    if (validateIpcChannel(channel, args.length > 0 ? args[0] : null)) return true;
    logger.error(`[IPC Security] Rejected ${kind} for channel: ${channel}`);
    return false;
  }

  ipcMain.handle = (channel, handler) => {
    return originalHandle(channel, (event, ...args) => {
      if (!isAllowed(channel, args, "handle request")) {
        return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
      }
      return handler(event, ...args);
    });
  };

  ipcMain.on = (channel, handler) => {
    const entry = remember(channel, handler, (event, ...args) => {
      if (!isAllowed(channel, args, "event")) return;
      return handler(event, ...args);
    });
    return originalOn(channel, entry.wrapper);
  };

  ipcMain.once = (channel, handler) => {
    const entry = remember(channel, handler, (event, ...args) => {
      // The emitter has already dropped this wrapper by the time it runs, so
      // drop our record of it too rather than leave a stale entry behind.
      forgetEntry(channel, handler, entry);
      if (!isAllowed(channel, args, "event")) return;
      return handler(event, ...args);
    });
    return originalOnce(channel, entry.wrapper);
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

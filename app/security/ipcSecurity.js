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

  // handler -> channel -> wrappers registered for it. Weak on the handler so a
  // listener that goes out of scope takes its bookkeeping with it.
  const wrappers = new WeakMap();

  function remember(channel, handler, wrapper) {
    let byChannel = wrappers.get(handler);
    if (!byChannel) {
      byChannel = new Map();
      wrappers.set(handler, byChannel);
    }
    const existing = byChannel.get(channel);
    if (existing) existing.push(wrapper);
    else byChannel.set(channel, [wrapper]);
    return wrapper;
  }

  // EventEmitter.removeListener drops the most recently added match, so pop to
  // match it. Falling back to the handler itself keeps removal working for
  // listeners that were registered before this wrapping was installed.
  function forget(channel, handler) {
    const registered = wrappers.get(handler)?.get(channel);
    return registered?.length ? registered.pop() : handler;
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
    return originalOn(channel, remember(channel, handler, (event, ...args) => {
      if (!isAllowed(channel, args, "event")) return;
      return handler(event, ...args);
    }));
  };

  ipcMain.once = (channel, handler) => {
    return originalOnce(channel, remember(channel, handler, (event, ...args) => {
      // The emitter has already dropped this wrapper by the time it runs, so
      // drop our record of it too rather than leave a stale entry behind.
      forget(channel, handler);
      if (!isAllowed(channel, args, "event")) return;
      return handler(event, ...args);
    }));
  };

  ipcMain.removeListener = (channel, handler) => {
    return originalRemoveListener(channel, forget(channel, handler));
  };

  // `off` is EventEmitter's alias for removeListener; keep them the same.
  ipcMain.off = ipcMain.removeListener;
}

module.exports = { installIpcSecurity };

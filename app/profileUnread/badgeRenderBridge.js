const crypto = require("node:crypto");

// Icons travel as canvas data URLs; anything else is refused. The cap bounds
// a hostile renderer's reply (the compositor is the Teams page's preload —
// same trust level as the organic tray-update path, but a new channel should
// not be looser than it has to be).
const DATA_URL_PREFIX = "data:image/";
const MAX_ICON_LENGTH = 2 * 1024 * 1024;

/**
 * Bridge for aggregate tray-badge rendering (ADR-020 Phase 2). Main cannot
 * composite (no canvas), so `requestBadgeRender(count)` asks the active
 * surface's renderer — trayIconRenderer's existing canvas path — to draw the
 * summed badge and resolves its reply, or null on any failure (timeout,
 * destroyed target, refused payload); the aggregator then keeps a fallback
 * icon. Replies are matched by an unguessable request id AND the responding
 * webContents' identity, and the icon must be a bounded data:image URL.
 *
 * Factory with injected deps so the matching/timeout/validation logic is
 * unit-testable without Electron.
 *
 * @param {object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {() => Electron.WebContents|null} deps.getTarget
 * @param {number} [deps.timeoutMs]
 * @returns {(count: number) => Promise<string|null>}
 */
function createBadgeRenderBridge({ ipcMain, getTarget, timeoutMs = 2000 }) {
  const pending = new Map();

  // Renderer reply for the aggregate tray badge (see render-aggregate-badge).
  ipcMain.on("aggregate-badge-rendered", (event, payload) => {
    const entry = pending.get(payload?.requestId);
    if (!entry || event.sender.id !== entry.senderId) return;
    pending.delete(payload.requestId);
    clearTimeout(entry.timer);
    const icon = payload.icon;
    entry.resolve(
      typeof icon === "string" &&
        icon.startsWith(DATA_URL_PREFIX) &&
        icon.length <= MAX_ICON_LENGTH
        ? icon
        : null
    );
  });

  return (count) =>
    new Promise((resolve) => {
      const target = getTarget();
      if (!target || target.isDestroyed()) {
        resolve(null);
        return;
      }
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve(null);
      }, timeoutMs);
      pending.set(requestId, { resolve, timer, senderId: target.id });
      try {
        target.send("render-aggregate-badge", { requestId, count });
      } catch (error) {
        // isDestroyed() then send() races a dying renderer; treat like any
        // other render failure instead of rejecting (which would be fatal).
        pending.delete(requestId);
        clearTimeout(timer);
        console.warn("[ProfileUnread] badge render request failed", {
          message: error.message,
        });
        resolve(null);
      }
    });
}

module.exports = { createBadgeRenderBridge };

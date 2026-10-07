const crypto = require("node:crypto");

// The compositor is the Teams page's preload, so replies are bounded and
// shape-checked rather than trusted.
const DATA_URL_PREFIX = "data:image/";
const MAX_ICON_LENGTH = 2 * 1024 * 1024;

/**
 * Asks the active surface's renderer to composite the aggregate badge (main
 * has no canvas) and resolves the reply, or null on any failure — the
 * aggregator keeps a fallback icon. Replies are matched by an unguessable
 * request id and the responding webContents' identity.
 *
 * Deps are injected so the matching/timeout/validation logic tests without
 * Electron.
 *
 * @param {object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {() => Electron.WebContents|null} deps.getTarget
 * @param {number} [deps.timeoutMs]
 * @param {(icon: string) => string|null} [deps.sanitizeIcon]  Decode-level
 *   validation; the prefix/size checks alone accept payloads that decode to
 *   an empty image.
 * @returns {(count: number) => Promise<string|null>}
 */
function createBadgeRenderBridge({
  ipcMain,
  getTarget,
  timeoutMs = 2000,
  sanitizeIcon = (icon) => icon,
}) {
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
        ? sanitizeIcon(icon)
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
        // isDestroyed() then send() races a dying renderer; a rejection here
        // would be fatal (process-wide unhandledRejection handler).
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

const { BrowserWindow } = require("electron");

/**
 * Build a modal child `BrowserWindow` for an in-app dialog (Add Profile,
 * Join Meeting, etc.). Centralises the common scaffolding — sandboxed
 * preload, modal+parent, no resize/min/max, hidden until ready — so
 * individual dialog modules only express what's specific to them
 * (title, dimensions, preload path).
 *
 * Multi-monitor positioning: when `parent` is provided and `position`
 * is not explicit, the helper computes a centred-on-parent `{ x, y }`
 * automatically. Without that, X11/Wayland with multiple displays
 * often lands the modal on the primary monitor regardless of where
 * the parent lives. Pass an explicit `position` to override (e.g. tests).
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {Electron.BrowserWindow} opts.parent
 * @param {string} opts.preload   Absolute path to the preload script.
 * @param {{x: number, y: number}} [opts.position]   Override automatic centring.
 * @returns {Electron.BrowserWindow}
 */
function createDialogWindow({ title, width, height, parent, preload, position }) {
  const resolvedPosition = position ?? computeParentCenter(parent, width, height);
  return new BrowserWindow({
    title,
    width,
    height,
    // `resolvedPosition` may be undefined if `parent` has no bounds and no
    // explicit position was passed; spreading undefined is a no-op so we
    // don't need a `?? {}` fallback (per `javascript:S7744`).
    ...resolvedPosition,
    resizable: false,
    minimizable: false,
    maximizable: false,
    modal: true,
    parent,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload,
    },
  });
}

function computeParentCenter(parent, dialogWidth, dialogHeight) {
  const bounds = parent?.getBounds?.();
  if (!bounds) return undefined;
  return {
    x: Math.round(bounds.x + (bounds.width - dialogWidth) / 2),
    y: Math.round(bounds.y + (bounds.height - dialogHeight) / 2),
  };
}

module.exports = createDialogWindow;

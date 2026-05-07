const { BrowserWindow } = require("electron");

/**
 * Build a modal child `BrowserWindow` for an in-app dialog (Add Profile,
 * Join Meeting, etc.). Centralises the common scaffolding — sandboxed
 * preload, modal+parent, no resize/min/max, hidden until ready — so
 * individual dialog modules only express what's specific to them
 * (title, dimensions, preload path, optional explicit position).
 *
 * Multi-monitor positioning: when `position` is provided (an `{ x, y }`
 * object computed against the parent's bounds), it is forwarded as-is
 * to `BrowserWindow`. Without it, Electron picks a default location
 * which on X11/Wayland with multiple displays often lands on the
 * primary monitor regardless of where the parent lives — so dialog
 * callers should always compute and pass a position.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {Electron.BrowserWindow} opts.parent
 * @param {string} opts.preload   Absolute path to the preload script.
 * @param {{x: number, y: number}} [opts.position]
 * @returns {Electron.BrowserWindow}
 */
function createDialogWindow({ title, width, height, parent, preload, position }) {
  return new BrowserWindow({
    title,
    width,
    height,
    // `position` is optional; spreading `undefined` is a no-op so we don't
    // need a `?? {}` fallback (per `javascript:S7744`).
    ...position,
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

module.exports = createDialogWindow;

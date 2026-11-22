"use strict";

// Applies the presence overlay that windowIconRenderer.js composites in the
// renderer (main has no canvas) to the main window icon, which is what the
// taskbar or panel entry shows on Linux and Windows. Gated on
// window.showStatus by the caller; nothing is registered with it off.
//
// Only the page the user is looking at may set the icon: the main window's
// own page, or with multi-account on, the active profile view. Every page's
// last icon is kept so that switching profile shows the new profile's status
// straight away instead of after its next status change.

const DATA_URL_PREFIX = "data:image/png;base64,";

class WindowStatusIcon {
  #ipcMain;
  #nativeImage;
  #getWindow;
  #getActiveWebContents;
  #getPlainIcon;
  // webContents id -> last data URL it sent (null for the plain icon).
  #icons = new Map();

  /**
   * @param {object} deps
   * @param {Electron.IpcMain} deps.ipcMain
   * @param {typeof Electron.nativeImage} deps.nativeImage
   * @param {() => Electron.BrowserWindow|null} deps.getWindow  The main window.
   * @param {() => Electron.WebContents|null} deps.getActiveWebContents  The
   *   page the user is looking at.
   * @param {() => Electron.NativeImage} deps.getPlainIcon  The window icon
   *   without a dot, resolved on every call so an App Icon change is followed.
   */
  constructor({ ipcMain, nativeImage, getWindow, getActiveWebContents, getPlainIcon }) {
    this.#ipcMain = ipcMain;
    this.#nativeImage = nativeImage;
    this.#getWindow = getWindow;
    this.#getActiveWebContents = getActiveWebContents;
    this.#getPlainIcon = getPlainIcon;
  }

  initialize() {
    // Set the main window icon to the presence overlay the renderer drew, or
    // back to the plain icon when the payload is null (window.showStatus)
    this.#ipcMain.on("window-icon-update", (event, icon) => this.#onUpdate(event, icon));
  }

  // Re-apply the active page's last icon, for a profile switch.
  refresh() {
    const active = this.#getActiveWebContents();
    this.#apply(active ? this.#icons.get(active.id) ?? null : null);
  }

  #onUpdate(event, icon) {
    const sender = event?.sender;
    if (typeof sender?.id !== "number") return;
    // Anything but a PNG data URL is treated as "no dot". The renderer only
    // ever sends canvas.toDataURL output or null.
    const dataUrl = typeof icon === "string" && icon.startsWith(DATA_URL_PREFIX) ? icon : null;
    if (!this.#icons.has(sender.id)) {
      // Forget a page once it is gone, so ids of closed profile views don't
      // pile up.
      sender.once?.("destroyed", () => this.#icons.delete(sender.id));
    }
    this.#icons.set(sender.id, dataUrl);
    if (this.#getActiveWebContents()?.id === sender.id) {
      this.#apply(dataUrl);
    }
  }

  #apply(dataUrl) {
    const window = this.#getWindow();
    if (!window || window.isDestroyed()) return;
    // createFromDataURL yields an EMPTY image (not a throw) for a malformed
    // payload, which would blank the taskbar entry.
    let image = dataUrl ? this.#nativeImage.createFromDataURL(dataUrl) : null;
    if (!image || image.isEmpty()) {
      image = this.#getPlainIcon();
    }
    window.setIcon(image);
  }
}

module.exports = WindowStatusIcon;

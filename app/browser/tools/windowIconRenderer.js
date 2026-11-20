"use strict";

const { nativeImage } = require("electron");
const TrayIconChooser = require("./trayIconChooser");
const {
  drawPresenceDot,
  isKnownPresence,
  wantsWindowStatus,
} = require("./presenceColors");

// The dot matches the tray overlay (trayIconRenderer.js): the same
// bottom-right position on the same 140-pixel grid. The grid is a square on
// the icon's shorter side, anchored bottom-right, so a non-square custom icon
// keeps its proportions and gets the same dot.
const GRID = 140;
const DOT = { x: 108, y: 104, radius: 24 };

// X11 drops a window icon that does not fit in one request, which is why main
// caps its longer side at 128 pixels (TrayIconChooser.windowImage); the
// composite keeps the same cap and proportions, so the dotted icon is never
// larger than the plain one.
const MAX_SIZE = 128;

// Presence overlay on the main window icon (window.showStatus), which is what
// the taskbar or panel entry shows on Linux and Windows. Main has no canvas,
// so the icon is composited here, like the tray's, and sent on
// window-icon-update; null tells main to restore the plain icon.
class WindowIconRenderer {
  // Private: anything on `this` is reachable from page script, including via
  // the listeners below (GHSA-58j7-22f8-6xqp).
  #ipcRenderer = null;
  #appIcon = "";
  #appIconType = "default";
  #statusCode = null;
  #baseIconDataUrl = null;
  #width = 0;
  #height = 0;
  #rendered = new Map();
  #sequence = 0;

  init(config, ipcRenderer) {
    if (!wantsWindowStatus(config)) {
      return;
    }
    this.#ipcRenderer = ipcRenderer;
    this.#appIcon = config.appIcon ?? "";
    this.#appIconType = config.appIconType ?? "default";

    // The presence detector (mqttStatusMonitor.js) dispatches this event
    // whenever it reads a different status off the Teams UI.
    globalThis.addEventListener("user-status-changed-local", (event) => {
      void this.#updateStatus(event.detail?.status);
    });

    // The App Icon menu sets the window back to the plain icon every time,
    // even when the same file is picked again or Reset finds the default
    // already in place, and then sends this delta. So the dot is sent again
    // whenever the delta carries appIcon, and only a different path throws
    // the cached composites away. Read the delta, not config: preload's own
    // config-changed listener may not have run yet.
    ipcRenderer.on("config-changed", (_event, changes) => {
      if (!("appIcon" in changes)) return;
      const appIcon = changes.appIcon ?? "";
      if (appIcon !== this.#appIcon) {
        this.#appIcon = appIcon;
        this.#baseIconDataUrl = null;
        this.#rendered.clear();
      }
      if (isKnownPresence(this.#statusCode)) {
        void this.#send();
      }
    });

    // Main keeps the last icon across page loads, and the monitor reports
    // only statuses it finds, so a sign-in page or a reload would otherwise
    // leave the previous dot in place. Every page starts from the plain icon.
    void this.#send();
  }

  #updateStatus(status) {
    if (!Number.isInteger(status) || status === this.#statusCode) {
      return;
    }
    this.#statusCode = status;
    return this.#send();
  }

  async #send() {
    // A status change that lands while an earlier one is still rendering wins;
    // the earlier result is dropped, so the icon never steps back.
    const sequence = ++this.#sequence;
    const status = this.#statusCode;
    let icon = null;
    if (isKnownPresence(status)) {
      try {
        icon = await this.render(status);
      } catch (error) {
        console.error("[WINDOW_ICON] Render failed, using the plain icon", {
          message: error.message,
        });
        icon = null;
      }
    }
    if (sequence !== this.#sequence) return;
    this.#ipcRenderer.send("window-icon-update", icon);
  }

  #loadBaseIcon() {
    const chooser = new TrayIconChooser({
      appIcon: this.#appIcon,
      appIconType: this.#appIconType,
    });
    const image = nativeImage.createFromPath(chooser.getFile());
    const { width, height } = image.getSize();
    const scale = Math.min(1, MAX_SIZE / Math.max(width, height, 1));
    this.#width = Math.round(width * scale);
    this.#height = Math.round(height * scale);
    const dataUrl = image.toDataURL();
    this.#baseIconDataUrl = !dataUrl || dataUrl === "data:," || this.#width === 0 || this.#height === 0
      ? null
      : dataUrl;
  }

  // Resolves the composited icon as a PNG data URL, or null when there is no
  // usable base icon (main then keeps the plain one). Each status is drawn
  // once per base icon.
  render(status) {
    if (this.#rendered.has(status)) {
      return Promise.resolve(this.#rendered.get(status));
    }
    if (this.#baseIconDataUrl === null) {
      this.#loadBaseIcon();
    }
    const baseIcon = this.#baseIconDataUrl;
    if (baseIcon === null) {
      return Promise.resolve(null);
    }
    const width = this.#width;
    const height = this.#height;
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onerror = () => resolve(null);
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0, width, height);
          const side = Math.min(width, height);
          ctx.translate(width - side, height - side);
          ctx.scale(side / GRID, side / GRID);
          drawPresenceDot(ctx, status, DOT);
          const dataUrl = canvas.toDataURL("image/png");
          // An App Icon change while this was drawing clears the cache; don't
          // put a composite of the old icon back into it.
          if (this.#baseIconDataUrl === baseIcon) {
            this.#rendered.set(status, dataUrl);
          }
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      };
      image.src = baseIcon;
    });
  }
}

module.exports = new WindowIconRenderer();

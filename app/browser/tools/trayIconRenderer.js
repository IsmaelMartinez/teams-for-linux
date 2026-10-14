const { nativeImage } = require("electron");
const TrayIconChooser = require("./trayIconChooser");
// wantsPresenceStatus is the shared predicate (presenceColors.js): the Dock
// draws the overlay on macOS (dockIconRenderer.js), the platforms that have no
// Dock draw it on the tray icon, and main asks the same question for the
// aggregate badge (profileUnread).
const {
  presenceColor,
  isDoNotDisturb,
  wantsPresenceStatus,
} = require("./presenceColors");

class TrayIconRenderer {
  #lastRequestedCount;
  #updateSequence = 0;
  #baseIconDataUrl = null;
  #statusCode = null;
  #currentCount = 0;

  init(config, ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.config = config;
    const iconChooser = new TrayIconChooser(config);
    this.baseIcon = nativeImage.createFromPath(iconChooser.getFile());
    // Defensive cache reset only; re-running init() is not otherwise safe
    // (it would double-register the unread-count listener)
    this.#baseIconDataUrl = null;
    this.iconSize = this.baseIcon.getSize();
    globalThis.addEventListener(
      "unread-count",
      this.updateActivityCount.bind(this),
    );
    // The presence detector (mqttStatusMonitor.js) dispatches this event
    // whenever it reads a different status off the Teams UI.
    if (wantsPresenceStatus(this.config)) {
      globalThis.addEventListener("user-status-changed-local", (event) => {
        // Fire-and-forget: the listener's return value is ignored, and
        // updateActivityCount never rejects.
        void this.#updateStatus(event.detail?.status);
      });
    }
    // Read the new path from the delta, not from this.config: preload's own
    // config-changed listener registers after this one, so this.config still
    // holds the previous value when we run.
    // ADR-020 Phase 2: main has no canvas, so it asks a live renderer to
    // composite the aggregate badge. Flag-gated: with multi-account off main
    // never asks.
    if (config.multiAccount?.enabled) {
      ipcRenderer.on('render-aggregate-badge', async (_event, { requestId, count }) => {
        let icon = null;
        // Count 0 still needs the canvas while there is a presence dot to
        // draw; with nothing to draw the reply stays null and the tray keeps
        // its plain icon.
        if (count > 0 || this.#presenceDotActive()) {
          try {
            icon = await this.render(count);
          } catch (error) {
            console.error("[TRAY_DIAG] Aggregate render failed", {
              message: error.message,
            });
          }
        }
        ipcRenderer.send('aggregate-badge-rendered', { requestId, icon });
      });
    }
    ipcRenderer.on('config-changed', (_event, changes) => {
      if ('appIcon' in changes && changes.appIcon !== this.config.appIcon) {
        const chooser = new TrayIconChooser({ ...this.config, appIcon: changes.appIcon });
        this.baseIcon = nativeImage.createFromPath(chooser.getFile());
        this.iconSize = this.baseIcon.getSize();
        this.#baseIconDataUrl = null;
        this.#lastRequestedCount = undefined;
        // A new base icon drops the composited dot, so re-render it instead of
        // waiting for the next unread-count event.
        if (wantsPresenceStatus(this.config) && this.#statusCode !== null) {
          this.updateActivityCount({ detail: { number: this.#currentCount } })
            .catch(() => {});
        }
      }
    });
  }

  // Whether the next render has a presence dot to draw. The dot needs the
  // canvas even at zero unread, which is why it is asked separately from the
  // unread count.
  #presenceDotActive() {
    return wantsPresenceStatus(this.config) && this.#statusCode !== null;
  }

  #updateStatus(status) {
    if (!Number.isInteger(status) || status === this.#statusCode) {
      return;
    }
    this.#statusCode = status;
    console.debug("[TRAY_DIAG] Presence status changed", {
      status,
      count: this.#currentCount,
    });
    // Force a render: the dot coexists with the unread badge.
    this.#lastRequestedCount = undefined;
    return this.updateActivityCount({ detail: { number: this.#currentCount } });
  }

  async updateActivityCount(event) {
    const count = event.detail.number;
    this.#currentCount = count;

    // Deduplicate against the most recently *requested* count, not the last
    // one that finished sending. Comparing against the completed count
    // swallows a clear-to-zero event that arrives while a non-zero render is
    // still awaiting the canvas, leaving the badge stuck (#2620).
    if (count === this.#lastRequestedCount) {
      console.debug("[TRAY_DIAG] Activity count unchanged, skipping update");
      return;
    }
    this.#lastRequestedCount = count;

    // Each update takes a sequence token; any update that finishes its render
    // after a newer one has started (including the render-free zero path) is
    // discarded, so out-of-order completions can never overwrite a newer count.
    const sequence = ++this.#updateSequence;
    const startTime = Date.now();

    console.debug("[TRAY_DIAG] Activity count update initiated", {
      newCount: count,
      willFlash: count > 0 && !this.config.disableNotificationWindowFlash
    });

    // Count 0 uses the base icon directly, skipping canvas rendering, unless
    // the presence dot is active: drawing it needs the canvas even when there
    // are no unread messages.
    const drawPresenceDot = this.#presenceDotActive();
    let icon = null;
    if (count > 0 || drawPresenceDot) {
      try {
        icon = await this.render(count);
      } catch (error) {
        console.error("[TRAY_DIAG] Icon render failed", {
          error: error.message,
          count: count,
          elapsedMs: Date.now() - startTime
        });
        // Allow a later event with the same count to retry
        this.#lastRequestedCount = undefined;
        return;
      }
    }

    if (sequence !== this.#updateSequence) {
      console.debug("[TRAY_DIAG] Update superseded while rendering, discarding", {
        staleCount: count
      });
      return;
    }

    this.ipcRenderer.send("tray-update", {
      icon: icon,
      flash: count > 0 && !this.config.disableNotificationWindowFlash,
      count: count,
    });

    console.debug("[TRAY_DIAG] Tray update IPC sent", {
      count: count,
      totalTimeMs: Date.now() - startTime
    });

    if (!this.config.disableBadgeCount) {
      await this.ipcRenderer.invoke("set-badge-count", count).catch(err =>
        console.error("[TRAY_DIAG] Failed to set badge count:", err.message)
      );
    }
  }

  render(newActivityCount) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.height = 140;
      canvas.width = 140;
      const image = new Image();
      
      // The data URL never changes for a given base icon, so encode it once
      // instead of re-encoding on every render.
      this.#baseIconDataUrl ??= this.baseIcon.toDataURL("image/png");
      const baseIconData = this.#baseIconDataUrl;
      
      image.onerror = () => {
        console.error("Failed to load base icon for tray rendering");
        resolve(baseIconData); // Fallback to base icon
      };

      image.onload = () => {
        // Drawing can throw (e.g. getContext returning null under memory
        // pressure); resolve with the base icon so the promise never hangs.
        try {
          this._addRedCircleNotification(
            canvas,
            image,
            newActivityCount,
            resolve,
          );
        } catch (error) {
          console.error("[TRAY_DIAG] Canvas drawing failed, using base icon:", error);
          resolve(baseIconData);
        }
      };

      if (!baseIconData || baseIconData === "data:,") {
        console.error("Base icon toDataURL returned invalid data");
        resolve(baseIconData); // Fallback
        return;
      }
      
      image.src = baseIconData;
    });
  }

  _addRedCircleNotification(canvas, image, newActivityCount, resolve) {
    const ctx = canvas.getContext("2d");

    ctx.drawImage(image, 0, 0, 140, 140);
    // The presence dot owns the bottom-right corner, so when both are drawn the
    // unread badge shrinks and moves to the bottom-left: the badge reaches x 64
    // and the dot's white ring starts at x 78. The smaller radius is what keeps
    // the whole badge inside the 140-pixel canvas (at the full size a badge
    // centred on 34 would start at x -6).
    const dotActive = this.#presenceDotActive();
    const badgeRadius = dotActive ? 30 : 40;
    const badgeX = dotActive ? 34 : 100;
    const badgeY = 90;
    if (newActivityCount > 0 && !this.config.disableBadgeCount) {
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.ellipse(badgeX, badgeY, badgeRadius, badgeRadius, 40, 0, 2 * Math.PI);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "white";

      // Scaled with the radius so the glyph keeps filling the badge.
      ctx.font =
        `bold ${dotActive ? 52 : 70}px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif`;
      const baseline = badgeY + badgeRadius / 2;
      if (newActivityCount > 9) {
        ctx.fillText("+", badgeX, baseline);
      } else {
        ctx.fillText(newActivityCount.toString(), badgeX, baseline);
      }
    }
    if (dotActive) {
      this._addPresenceDot(ctx);
    }
    const resizedCanvas = this._getResizeCanvasWithOriginalIconSize(canvas);
    resolve(resizedCanvas.toDataURL());
  }

  // Presence dot in the bottom-right corner, the way the Windows client shows
  // it on its tray icon. Colours are shared with the macOS Dock overlay.
  _addPresenceDot(ctx) {
    const x = 108;
    const y = 104;
    const radius = 24;

    // White ring, so the dot stays readable on a dark or busy icon.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = presenceColor(this.#statusCode);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();

    // Do Not Disturb reads as a white bar, exactly as on the macOS Dock.
    if (isDoNotDisturb(this.#statusCode)) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 13, y - 4, 26, 8);
    }
  }

  _getResizeCanvasWithOriginalIconSize(canvas) {
    const resizedCanvas = document.createElement("canvas");
    const rctx = resizedCanvas.getContext("2d");

    resizedCanvas.width = this.iconSize.width;
    resizedCanvas.height = this.iconSize.height;

    const scaleFactorX = this.iconSize.width / canvas.width;
    const scaleFactorY = this.iconSize.height / canvas.height;
    rctx.scale(scaleFactorX, scaleFactorY);
    rctx.drawImage(canvas, 0, 0);

    return resizedCanvas;
  }
}

module.exports = new TrayIconRenderer();

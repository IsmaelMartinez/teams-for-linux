const { nativeImage } = require("electron");
const TrayIconChooser = require("./trayIconChooser");
class TrayIconRenderer {
  #lastRequestedCount;
  #updateSequence = 0;

  init(config, ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.config = config;
    const iconChooser = new TrayIconChooser(config);
    this.baseIcon = nativeImage.createFromPath(iconChooser.getFile());
    this.iconSize = this.baseIcon.getSize();
    globalThis.addEventListener(
      "unread-count",
      this.updateActivityCount.bind(this),
    );
  }

  async updateActivityCount(event) {
    const count = event.detail.number;

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

    // Count 0 uses the base icon directly, skipping canvas rendering
    let icon = null;
    if (count > 0) {
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
    const IMAGE_PNG = "image/png";
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.height = 140;
      canvas.width = 140;
      const image = new Image();
      
      const baseIconData = this.baseIcon.toDataURL(IMAGE_PNG);
      
      // Add error handling for image loading
      image.onerror = () => {
        console.error("Failed to load base icon for tray rendering");
        resolve(baseIconData); // Fallback to base icon
      };

      image.onload = () =>
        this._addRedCircleNotification(
          canvas,
          image,
          newActivityCount,
          resolve,
        );

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
    if (newActivityCount > 0 && !this.config.disableBadgeCount) {
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.ellipse(100, 90, 40, 40, 40, 0, 2 * Math.PI);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "white";

      ctx.font =
        'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';
      if (newActivityCount > 9) {
        ctx.fillText("+", 100, 110);
      } else {
        ctx.fillText(newActivityCount.toString(), 100, 110);
      }
    }
    const resizedCanvas = this._getResizeCanvasWithOriginalIconSize(canvas);
    resolve(resizedCanvas.toDataURL());
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

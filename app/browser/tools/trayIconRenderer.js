const { nativeImage } = require("electron");
const TrayIconChooser = require("./trayIconChooser");

/**
 * Renders the tray icon with an optional notification badge count.
 * This class handles the canvas-based rendering of the tray icon in the browser process
 * and communicates updates to the main process via IPC.
 */
class TrayIconRenderer {
  #lastActivityCount;
  #currentProcessingCount;

  /**
   * Initializes the renderer with configuration and IPC.
   *
   * @param {object} config - Application configuration
   * @param {object} ipcRenderer - Electron IPC renderer
   */
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

  /**
   * Handles unread count change events and triggers tray icon updates.
   * Includes optimizations to skip redundant updates and handles race conditions.
   *
   * @param {CustomEvent} event - The unread-count event
   */
  async updateActivityCount(event) {
    const count = event.detail.number;

    // Skip if count hasn't changed to avoid redundant work
    if (count === this.#lastActivityCount) {
      console.debug("[TRAY_DIAG] Activity count unchanged, skipping update");
      return;
    }

    const startTime = Date.now();

    console.debug("[TRAY_DIAG] Activity count update initiated", {
      newCount: count,
      previousCount: this.#lastActivityCount || 0,
      timestamp: new Date().toISOString(),
      willFlash: count > 0 && !this.config.disableNotificationWindowFlash,
      suggestion: "Monitor renderTimeMs and totalTimeMs for performance issues",
    });

    // Special case for count 0: Use base icon directly to avoid canvas rendering
    if (count === 0) {
      console.debug(
        "[TRAY_DIAG] Count is 0, using base icon without rendering",
      );
      this.ipcRenderer.send("tray-update", {
        icon: null, // Let main process use the default icon
        flash: false,
        count: 0,
      });
      if (!this.config.disableBadgeCount) {
        await this.ipcRenderer.invoke("set-badge-count", 0).catch((err) => {
          console.error("[TRAY_DIAG] Failed to set badge count:", err.message);
        });
      }
      this.#lastActivityCount = 0;
      return;
    }

    this.#currentProcessingCount = count;
    try {
      const { icon, renderedCount } = await this.render(count);

      // Prevent race conditions: check if the count has changed since rendering started
      if (renderedCount !== this.#currentProcessingCount) {
        console.debug("[TRAY_DIAG] Stale render detected, discarding result", {
          renderedCount,
          currentProcessingCount: this.#currentProcessingCount,
        });
        return;
      }

      const renderTime = Date.now() - startTime;
      console.debug("[TRAY_DIAG] Icon render completed, sending tray update", {
        count: count,
        renderTimeMs: renderTime,
        iconDataLength: icon?.length || 0,
        willFlash: count > 0 && !this.config.disableNotificationWindowFlash,
        performanceNote:
          renderTime > 100
            ? "Slow icon rendering detected"
            : "Normal rendering speed",
      });

      const ipcStartTime = Date.now();
      this.ipcRenderer.send("tray-update", {
        icon: icon,
        flash: count > 0 && !this.config.disableNotificationWindowFlash,
        count: count,
      });

      console.debug("[TRAY_DIAG] Tray update IPC sent", {
        count: count,
        totalTimeMs: Date.now() - startTime,
        ipcCallTimeMs: Date.now() - ipcStartTime,
        performanceNote:
          Date.now() - startTime > 200
            ? "Slow tray update detected"
            : "Normal tray update speed",
      });
      this.#lastActivityCount = count;
    } catch (error) {
      console.error("[TRAY_DIAG] Icon render failed", {
        error: error.message,
        count: count,
        elapsedMs: Date.now() - startTime,
        suggestion: "Check canvas creation and image loading in render method",
      });
    }

    if (!this.config.disableBadgeCount) {
      await this.ipcRenderer.invoke("set-badge-count", count).catch((err) => {
        console.error("[TRAY_DIAG] Failed to set badge count:", err.message);
      });
    }
  }

  /**
   * Renders the icon with a red circle and badge count.
   *
   * @param {number} newActivityCount - The number of unread activities
   * @returns {Promise<{icon: string, renderedCount: number}>} - The rendered icon data URL and original count
   */
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
        resolve({
          icon: baseIconData,
          renderedCount: newActivityCount,
        }); // Fallback to base icon
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
        resolve({
          icon: baseIconData,
          renderedCount: newActivityCount,
        }); // Fallback
        return;
      }

      image.src = baseIconData;
    });
  }

  /**
   * Draws the notification circle and text onto the icon.
   *
   * @private
   */
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
    resolve({
      icon: resizedCanvas.toDataURL(),
      renderedCount: newActivityCount,
    });
  }

  /**
   * Resizes the high-resolution canvas to the native tray icon size.
   *
   * @private
   */
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

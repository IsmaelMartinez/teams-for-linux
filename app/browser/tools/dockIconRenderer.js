const { nativeImage } = require("electron");
const path = require("node:path");

class DockIconRenderer {
  init(config, ipcRenderer) {
    // The dock only exists on macOS; the main process discards the IPC
    // elsewhere, so don't pay for rendering at all on other platforms.
    if (process.platform !== "darwin" || !config.media?.showStatusOnDockIcon) {
      return;
    }
    this.ipcRenderer = ipcRenderer;

    const iconPath = path.join(__dirname, "../..", "assets/icons/icon-256x256.png");
    // Encode the base icon once; render() memoizes the composited result per
    // status code, so each of the few statuses is drawn at most once.
    this.baseIconDataUrl = nativeImage.createFromPath(iconPath).toDataURL();
    this.renderedByStatus = new Map();

    // Listen for status changes from the status monitor
    globalThis.addEventListener("user-status-changed-local", (event) => {
      this.updateDockIcon(event.detail.status);
    });

    // Run initial update to status 0 (offline)
    this.updateDockIcon(0);
  }

  async updateDockIcon(status) {
    try {
      const iconDataUrl = await this.render(status);
      if (iconDataUrl) {
        this.ipcRenderer.send("dock-icon-update", iconDataUrl);
      }
    } catch (err) {
      console.error("[DockIconRenderer] Failed to update dock icon:", err);
    }
  }

  render(status) {
    if (this.renderedByStatus.has(status)) {
      return Promise.resolve(this.renderedByStatus.get(status));
    }
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 256, 256);

        // Draw status dot in bottom right
        let color = "#7f7f7f"; // Offline/Unknown
        let isDnd = false;

        switch (status) {
          case 1: // Available
            color = "#107c41"; // green
            break;
          case 2: // Busy
            color = "#d83b01"; // red
            break;
          case 3: // Do Not Disturb
            color = "#a80000"; // dark red
            isDnd = true;
            break;
          case 4: // Away
          case 5: // Be Right Back
            color = "#ffb900"; // yellow
            break;
        }

        // Status circle parameters (offset for standard macOS squircle spacing)
        const x = 205;
        const y = 205;
        const radius = 30;

        // Draw border
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, radius + 6, 0, 2 * Math.PI);
        ctx.fill();

        // Draw color circle
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();

        // If DND, draw white horizontal bar in the middle of the circle
        if (isDnd) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x - 16, y - 5, 32, 10);
        }

        const dataUrl = canvas.toDataURL();
        this.renderedByStatus.set(status, dataUrl);
        resolve(dataUrl);
      };

      img.onerror = () => {
        console.error("[DockIconRenderer] Failed to load base icon");
        resolve(null);
      };

      img.src = this.baseIconDataUrl;
    });
  }
}

module.exports = new DockIconRenderer();

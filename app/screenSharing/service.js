const { ipcMain, BrowserWindow, desktopCapturer, screen } = require("electron");
const path = require("node:path");

class ScreenSharingService {
  #picker = null;
  #selectedScreenShareSource = null;
  #previewWindow = null;

  constructor() {
    // No dependencies required
  }

  initialize() {
    // Get available desktop capturer sources (screens/windows) for sharing
    ipcMain.handle("desktop-capturer-get-sources", this.#handleGetDesktopCapturerSources.bind(this));
    // Select desktop media source for screen sharing
    ipcMain.handle("choose-desktop-media", this.#handleChooseDesktopMedia.bind(this));
    // Cancel desktop media selection dialog
    ipcMain.on("cancel-desktop-media", this.#handleCancelDesktopMedia.bind(this));
    // Notify when screen sharing session starts
    ipcMain.on("screen-sharing-started", this.#handleScreenSharingStarted.bind(this));
    // Notify when screen sharing session stops
    ipcMain.on("screen-sharing-stopped", this.#handleScreenSharingStopped.bind(this));
    // Get current screen sharing status
    ipcMain.handle("get-screen-sharing-status", this.#handleGetScreenSharingStatus.bind(this));
    // Get screen share stream for thumbnail preview
    ipcMain.handle("get-screen-share-stream", this.#handleGetScreenShareStream.bind(this));
    // Get screen share screen details
    ipcMain.handle("get-screen-share-screen", this.#handleGetScreenShareScreen.bind(this));
    // Resize screen sharing preview window
    ipcMain.on("resize-preview-window", this.#handleResizePreviewWindow.bind(this));
    // Stop screen sharing from thumbnail preview
    ipcMain.on("stop-screen-sharing-from-thumbnail", this.#handleStopScreenSharingFromThumbnail.bind(this));
  }

  setSelectedSource(source) {
    this.#selectedScreenShareSource = source;
  }

  getSelectedSource() {
    return this.#selectedScreenShareSource;
  }

  setPreviewWindow(window) {
    this.#previewWindow = window;
  }

  getPreviewWindow() {
    return this.#previewWindow;
  }

  isScreenSharingActive() {
    return this.#selectedScreenShareSource !== null;
  }

  /**
   * Get desktop capturer sources with thumbnails converted to data URLs.
   * Uses static thumbnails instead of live video streams to prevent SIGILL crashes.
   * @author bluvulture (PR #2089)
   */
  async #handleGetDesktopCapturerSources(_event, opts) {
    try {
      const sources = await desktopCapturer.getSources(opts);

      // Convert NativeImage thumbnails to data URLs for IPC serialization
      return sources.map(source => {
        let thumbnailDataUrl = null;
        let appIconDataUrl = null;

        try {
          if (source.thumbnail && !source.thumbnail.isEmpty()) {
            thumbnailDataUrl = source.thumbnail.toDataURL();
          }
        } catch (err) {
          console.error(`[SCREEN_SHARE] Error converting thumbnail for ${source.id}:`, err);
        }

        try {
          if (source.appIcon && !source.appIcon.isEmpty()) {
            appIconDataUrl = source.appIcon.toDataURL();
          }
        } catch (err) {
          console.error(`[SCREEN_SHARE] Error converting appIcon for ${source.id}:`, err);
        }

        return {
          id: source.id,
          name: source.name,
          display_id: source.display_id,
          thumbnailDataUrl,
          appIconDataUrl
        };
      });
    } catch (error) {
      console.error("[SCREEN_SHARE] Failed to get desktop capturer sources:", error.message);
      return [];
    }
  }

  async #handleChooseDesktopMedia(_event, sourceTypes) {
    try {
      const sources = await desktopCapturer.getSources({ types: sourceTypes });
      if (!sources || sources.length === 0) {
        console.warn("[SCREEN_SHARE] No screen sources available");
        return null;
      }
      const chosen = await this.#showScreenPicker(sources);
      return chosen ? chosen.id : null;
    } catch (error) {
      console.error("[SCREEN_SHARE] Failed to get desktop media sources:", error.message);
      return null;
    }
  }

  #handleCancelDesktopMedia() {
    if (this.#picker) {
      this.#picker.close();
    }
  }

  #handleScreenSharingStarted(_event, sourceId) {
    // Only update if we received a valid source ID format (screen:x:y or window:x:y)
    if (sourceId) {
      const isValidFormat = sourceId.startsWith('screen:') || sourceId.startsWith('window:');
      if (isValidFormat) {
        this.#selectedScreenShareSource = sourceId;
      }
      // Ignore UUID format (MediaStream.id) - keep existing value
    }
  }

  #handleScreenSharingStopped() {
    this.#selectedScreenShareSource = null;

    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      this.#previewWindow.close();
    }
  }

  #handleGetScreenSharingStatus() {
    return this.#selectedScreenShareSource !== null;
  }

  #handleGetScreenShareStream() {
    if (typeof this.#selectedScreenShareSource === "string") {
      return this.#selectedScreenShareSource;
    } else if (this.#selectedScreenShareSource?.id) {
      return this.#selectedScreenShareSource.id;
    }
    return null;
  }

  #handleGetScreenShareScreen() {
    if (
      this.#selectedScreenShareSource &&
      typeof this.#selectedScreenShareSource === "object"
    ) {
      const displays = screen.getAllDisplays();

      if (this.#selectedScreenShareSource?.id?.startsWith("screen:")) {
        const display = displays[0] || { size: { width: 1920, height: 1080 } };
        return { width: display.size.width, height: display.size.height };
      }
    }

    return { width: 1920, height: 1080 };
  }

  #handleResizePreviewWindow(_event, { width, height }) {
    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      const [minWidth, minHeight] = this.#previewWindow.getMinimumSize();
      const newWidth = Math.max(minWidth, Math.min(width, 480));
      const newHeight = Math.max(minHeight, Math.min(height, 360));
      this.#previewWindow.setSize(newWidth, newHeight);
      this.#previewWindow.center();
    }
  }

  #handleStopScreenSharingFromThumbnail() {
    this.#selectedScreenShareSource = null;
    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      this.#previewWindow.webContents.send("screen-sharing-status-changed");
    }
  }

  #showScreenPicker(sources) {
    if (this.#picker) {
      this.#picker.focus();
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      this.#picker = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          preload: path.join(__dirname, "..", "screenPicker", "preload.js"),
        },
      });

      this.#picker.loadFile(path.join(__dirname, "..", "screenPicker", "index.html"));

      this.#picker.webContents.on("did-finish-load", () => {
        this.#picker.webContents.send("sources-list", sources);
      });

      const onSourceSelected = (_event, source) => {
        resolve(source);
        if (this.#picker) {
          this.#picker.close();
        }
      };

      // Receive selected screen sharing source from native picker window
      ipcMain.once("source-selected", onSourceSelected);

      this.#picker.on("closed", () => {
        ipcMain.removeListener("source-selected", onSourceSelected);
        this.#picker = null;
        resolve(null);
      });
    });
  }
}

module.exports = ScreenSharingService;

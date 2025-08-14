const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

class ScreenSharingManager {
  constructor(config) {
    this.config = config;
    this.isActive = false;
    this.currentSourceId = null;
    this.currentScreenConfig = null;
    this.previewWindow = null;

    this.#setupIpcHandlers();
  }

  #setupIpcHandlers() {
    // Screen sharing lifecycle handlers
    ipcMain.on("screen-sharing-started", (event, sourceId) => {
      this.isActive = true;
      
      // Use the real source ID from the stream selector if available
      if (global.selectedScreenShareSource) {
        this.currentSourceId = global.selectedScreenShareSource.id;
        this.currentScreenConfig = {
          width: global.selectedScreenShareSource.thumbnail?.getSize()?.width || 1920,
          height: global.selectedScreenShareSource.thumbnail?.getSize()?.height || 1080
        };
      } else {
        this.currentSourceId = sourceId;
        this.currentScreenConfig = { width: 1920, height: 1080 };
      }

      this.#createPreviewWindow();
    });

    ipcMain.on("screen-sharing-stopped", () => {
      this.#stopSharing();
    });

    ipcMain.on("stop-screen-sharing-from-thumbnail", () => {
      this.#stopSharing();
    });

    // Window lifecycle handlers
    ipcMain.on("screen-share-preview-opened", () => {
      // Preview window opened
    });

    ipcMain.on("screen-share-preview-closed", () => {
      if (this.isActive) {
        this.#stopSharing();
      }
    });

    // Status handlers
    ipcMain.handle("get-screen-sharing-status", async () => {
      return this.isActive;
    });

    ipcMain.handle("get-screen-share-stream", async () => {
      return this.currentSourceId;
    });

    ipcMain.handle("get-screen-share-screen", async () => {
      return this.currentScreenConfig;
    });

    // Main preview window creation handler
    ipcMain.handle("create-call-pop-out-window", async () => {
      this.#createPreviewWindow();
    });
  }

  #createPreviewWindow() {
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.focus();
      return;
    }

    const thumbnailConfig = this.config.screenSharingThumbnail || {};

    if (thumbnailConfig.enabled === false) {
      return;
    }

    this.previewWindow = new BrowserWindow({
      width: 320,
      height: 180,
      minWidth: 200,
      minHeight: 120,
      show: false,
      resizable: true,
      alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
      frame: true,
      title: "Teams Screen Share Preview",
      webPreferences: {
        preload: path.join(__dirname, "previewWindowPreload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: "persist:teams-for-linux-session",
      },
    });

    this.previewWindow.loadFile(path.join(__dirname, "previewWindow.html"));

    this.previewWindow.once("ready-to-show", () => {
      this.previewWindow.show();
      try {
        ipcMain.emit("screen-share-preview-opened");
      } catch (error) {
        console.error(
          "Error sending screen-share-preview-opened event:",
          error
        );
      }
    });

    this.previewWindow.on("closed", () => {
      try {
        ipcMain.emit("screen-share-preview-closed");
      } catch (error) {
        console.error(
          "Error sending screen-share-preview-closed event:",
          error
        );
      }
      this.previewWindow = null;
    });

    // Handle window resize
    ipcMain.on("resize-preview-window", (event, { width, height }) => {
      if (this.previewWindow && !this.previewWindow.isDestroyed()) {
        const [currentWidth, currentHeight] = this.previewWindow.getSize();
        const [minWidth, minHeight] = this.previewWindow.getMinimumSize();

        // Ensure we respect minimum sizes and keep window small (thumbnail size)
        const newWidth = Math.max(minWidth, Math.min(width, 480));
        const newHeight = Math.max(minHeight, Math.min(height, 360));

        if (newWidth !== currentWidth || newHeight !== currentHeight) {
          this.previewWindow.setSize(newWidth, newHeight);
          this.previewWindow.center();
        }
      }
    });

    // Handle window close
    ipcMain.on("close-preview-window", () => {
      if (this.previewWindow && !this.previewWindow.isDestroyed()) {
        this.previewWindow.close();
      }
    });
  }

  #stopSharing() {
    this.isActive = false;
    this.currentSourceId = null;
    this.currentScreenConfig = null;

    // Close preview window
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.close();
      this.previewWindow = null;
    }
  }

  // Public methods
  getStatus() {
    return {
      isActive: this.isActive,
      sourceId: this.currentSourceId,
      screenConfig: this.currentScreenConfig,
    };
  }

  updateConfig(newConfig) {
    this.config = newConfig;

    // Update existing preview window if alwaysOnTop setting changed
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      const thumbnailConfig = this.config.screenSharingThumbnail || {};
      this.previewWindow.setAlwaysOnTop(thumbnailConfig.alwaysOnTop || false);
    }
  }

  cleanup() {
    this.#stopSharing();

    // Remove IPC handlers
    ipcMain.removeAllListeners("screen-sharing-started");
    ipcMain.removeAllListeners("screen-sharing-stopped");
    ipcMain.removeAllListeners("stop-screen-sharing-from-thumbnail");
    ipcMain.removeAllListeners("screen-share-preview-opened");
    ipcMain.removeAllListeners("screen-share-preview-closed");
    ipcMain.removeAllListeners("resize-preview-window");
    ipcMain.removeAllListeners("close-preview-window");
  }
}

module.exports = ScreenSharingManager;

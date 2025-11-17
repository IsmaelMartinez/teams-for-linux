const { ipcMain, BrowserWindow, desktopCapturer, screen } = require("electron");
const path = require("node:path");

/**
 * ScreenSharingService
 *
 * Handles IPC communication and state management for screen sharing functionality.
 * This service is responsible for:
 * - Managing desktop capturer source selection (picker dialog)
 * - Tracking screen sharing session lifecycle (started/stopped events)
 * - Managing preview window state and communication
 * - Providing screen sharing status and stream information to renderer processes
 *
 * Dependencies are injected to improve testability and break coupling with global state.
 */
class ScreenSharingService {
  #mainWindow;
  #picker = null;

  /**
   * Create a ScreenSharingService
   *
   * @param {Object} mainWindow - Main application window module
   */
  constructor(mainWindow) {
    this.#mainWindow = mainWindow;
  }

  /**
   * Register IPC handlers for screen sharing
   * Call this method after instantiation to set up IPC communication
   */
  initialize() {
    // Desktop capturer handlers
    ipcMain.handle("desktop-capturer-get-sources", this.#handleGetDesktopCapturerSources.bind(this));
    ipcMain.handle("choose-desktop-media", this.#handleChooseDesktopMedia.bind(this));
    ipcMain.on("cancel-desktop-media", this.#handleCancelDesktopMedia.bind(this));

    // Screen sharing lifecycle handlers
    ipcMain.on("screen-sharing-started", this.#handleScreenSharingStarted.bind(this));
    ipcMain.on("screen-sharing-stopped", this.#handleScreenSharingStopped.bind(this));

    // Preview window management handlers
    ipcMain.handle("get-screen-sharing-status", this.#handleGetScreenSharingStatus.bind(this));
    ipcMain.handle("get-screen-share-stream", this.#handleGetScreenShareStream.bind(this));
    ipcMain.handle("get-screen-share-screen", this.#handleGetScreenShareScreen.bind(this));
    ipcMain.on("resize-preview-window", this.#handleResizePreviewWindow.bind(this));
    ipcMain.on("stop-screen-sharing-from-thumbnail", this.#handleStopScreenSharingFromThumbnail.bind(this));
  }

  /**
   * IPC handler for getting desktop capturer sources
   * @private
   */
  async #handleGetDesktopCapturerSources(_event, opts) {
    return desktopCapturer.getSources(opts);
  }

  /**
   * IPC handler for choosing desktop media (shows picker dialog)
   * @private
   */
  async #handleChooseDesktopMedia(_event, sourceTypes) {
    const sources = await desktopCapturer.getSources({ types: sourceTypes });
    const chosen = await this.#showScreenPicker(sources);
    return chosen ? chosen.id : null;
  }

  /**
   * IPC handler for canceling desktop media selection
   * @private
   */
  #handleCancelDesktopMedia() {
    if (this.#picker) {
      this.#picker.close();
    }
  }

  /**
   * IPC handler for screen sharing started event
   * @private
   */
  #handleScreenSharingStarted(event, sourceId) {
    try {
      console.debug("[SCREEN_SHARE_DIAG] Screen sharing session started", {
        receivedSourceId: sourceId,
        existingSourceId: globalThis.selectedScreenShareSource,
        timestamp: new Date().toISOString(),
        hasExistingPreview: globalThis.previewWindow && !globalThis.previewWindow.isDestroyed(),
        mainWindowVisible: this.#mainWindow?.isVisible?.() || false,
        mainWindowFocused: this.#mainWindow?.isFocused?.() || false
      });

      // Only update if we received a valid source ID
      if (sourceId) {
        // Validate format - must be screen:x:y or window:x:y (not UUID)
        const isValidFormat = sourceId.startsWith('screen:') || sourceId.startsWith('window:');

        if (isValidFormat) {
          console.debug("[SCREEN_SHARE_DIAG] Received valid source ID format, updating", {
            sourceId: sourceId,
            sourceType: sourceId.startsWith('screen:') ? 'screen' : 'window'
          });
          globalThis.selectedScreenShareSource = sourceId;
        } else {
          // UUID format detected - this is the bug we're fixing
          console.warn("[SCREEN_SHARE_DIAG] Received invalid source ID format (UUID?), keeping existing", {
            received: sourceId,
            existing: globalThis.selectedScreenShareSource,
            note: "MediaStream.id (UUID) cannot be used for preview window - see ADR"
          });
          // Keep existing value, don't overwrite
        }
      } else {
        console.debug("[SCREEN_SHARE_DIAG] No source ID received (null), keeping existing", {
          existing: globalThis.selectedScreenShareSource,
          note: "Source ID was already set correctly by setupScreenSharing()"
        });
      }

      console.debug("[SCREEN_SHARE_DIAG] Screen sharing source registered", {
        sourceId: globalThis.selectedScreenShareSource,
        sourceType: globalThis.selectedScreenShareSource?.startsWith?.('screen:') ? 'screen' : 'window',
        willCreatePreview: true
      });

    } catch (error) {
      console.error("[SCREEN_SHARE_DIAG] Error handling screen-sharing-started event", {
        error: error.message,
        sourceId: sourceId,
        stack: error.stack
      });
    }
  }

  /**
   * IPC handler for screen sharing stopped event
   * @private
   */
  #handleScreenSharingStopped() {
    console.debug("[SCREEN_SHARE_DIAG] Screen sharing session stopped", {
      timestamp: new Date().toISOString(),
      stoppedSource: globalThis.selectedScreenShareSource,
      previewWindowExists: globalThis.previewWindow && !globalThis.previewWindow.isDestroyed(),
      mainWindowState: {
        visible: this.#mainWindow?.isVisible?.() || false,
        focused: this.#mainWindow?.isFocused?.() || false
      }
    });

    globalThis.selectedScreenShareSource = null;

    // Close preview window when screen sharing stops
    if (globalThis.previewWindow && !globalThis.previewWindow.isDestroyed()) {
      console.debug("[SCREEN_SHARE_DIAG] Closing preview window after screen sharing stopped");
      globalThis.previewWindow.close();
    } else {
      console.debug("[SCREEN_SHARE_DIAG] No preview window to close");
    }
  }

  /**
   * IPC handler for getting screen sharing status
   * @private
   */
  #handleGetScreenSharingStatus() {
    return globalThis.selectedScreenShareSource !== null;
  }

  /**
   * IPC handler for getting screen share stream source ID
   * @private
   */
  #handleGetScreenShareStream() {
    // Return the source ID - handle both string and object formats
    if (typeof globalThis.selectedScreenShareSource === "string") {
      return globalThis.selectedScreenShareSource;
    } else if (globalThis.selectedScreenShareSource?.id) {
      return globalThis.selectedScreenShareSource.id;
    }
    return null;
  }

  /**
   * IPC handler for getting screen share screen dimensions
   * @private
   */
  #handleGetScreenShareScreen() {
    // Return screen dimensions if available from StreamSelector, otherwise default
    if (
      globalThis.selectedScreenShareSource &&
      typeof globalThis.selectedScreenShareSource === "object"
    ) {
      const displays = screen.getAllDisplays();

      if (globalThis.selectedScreenShareSource?.id?.startsWith("screen:")) {
        const display = displays[0] || { size: { width: 1920, height: 1080 } };
        return { width: display.size.width, height: display.size.height };
      }
    }

    return { width: 1920, height: 1080 };
  }

  /**
   * IPC handler for resizing preview window
   * @private
   */
  #handleResizePreviewWindow(event, { width, height }) {
    if (globalThis.previewWindow && !globalThis.previewWindow.isDestroyed()) {
      const [minWidth, minHeight] = globalThis.previewWindow.getMinimumSize();
      const newWidth = Math.max(minWidth, Math.min(width, 480));
      const newHeight = Math.max(minHeight, Math.min(height, 360));
      globalThis.previewWindow.setSize(newWidth, newHeight);
      globalThis.previewWindow.center();
    }
  }

  /**
   * IPC handler for stopping screen sharing from thumbnail
   * @private
   */
  #handleStopScreenSharingFromThumbnail() {
    globalThis.selectedScreenShareSource = null;
    if (globalThis.previewWindow && !globalThis.previewWindow.isDestroyed()) {
      globalThis.previewWindow.webContents.send("screen-sharing-status-changed");
    }
  }

  /**
   * Show screen/window picker dialog
   *
   * @private
   * @param {Array} sources - Array of available desktop capturer sources
   * @returns {Promise<Object|null>} Selected source or null if cancelled
   */
  #showScreenPicker(sources) {
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

      ipcMain.once("source-selected", (event, source) => {
        resolve(source);
        if (this.#picker) {
          this.#picker.close();
        }
      });

      this.#picker.on("closed", () => {
        this.#picker = null;
        resolve(null);
      });
    });
  }
}

module.exports = ScreenSharingService;

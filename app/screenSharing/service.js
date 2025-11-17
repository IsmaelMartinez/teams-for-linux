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
 * State is encapsulated within the service using private fields, eliminating the need
 * for global state and improving testability.
 */
class ScreenSharingService {
  #mainWindow;
  #picker = null;
  #selectedScreenShareSource = null;
  #previewWindow = null;

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
   * Set the selected screen share source
   * Called by mainAppWindow when user selects a source via StreamSelector
   *
   * @param {string|Object} source - The selected source (string ID or source object)
   * @public
   */
  setSelectedSource(source) {
    this.#selectedScreenShareSource = source;
  }

  /**
   * Get the selected screen share source
   *
   * @returns {string|Object|null} The selected source or null if none
   * @public
   */
  getSelectedSource() {
    return this.#selectedScreenShareSource;
  }

  /**
   * Set the preview window
   * Called by mainAppWindow when creating the preview window
   *
   * @param {BrowserWindow} window - The preview window instance
   * @public
   */
  setPreviewWindow(window) {
    this.#previewWindow = window;
  }

  /**
   * Get the preview window
   *
   * @returns {BrowserWindow|null} The preview window or null if none
   * @public
   */
  getPreviewWindow() {
    return this.#previewWindow;
  }

  /**
   * Check if screen sharing is currently active
   *
   * @returns {boolean} True if screen sharing is active
   * @public
   */
  isScreenSharingActive() {
    return this.#selectedScreenShareSource !== null;
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
        existingSourceId: this.#selectedScreenShareSource,
        timestamp: new Date().toISOString(),
        hasExistingPreview: this.#previewWindow && !this.#previewWindow.isDestroyed(),
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
          this.#selectedScreenShareSource = sourceId;
        } else {
          // UUID format detected - this is the bug we're fixing
          console.warn("[SCREEN_SHARE_DIAG] Received invalid source ID format (UUID?), keeping existing", {
            received: sourceId,
            existing: this.#selectedScreenShareSource,
            note: "MediaStream.id (UUID) cannot be used for preview window - see ADR"
          });
          // Keep existing value, don't overwrite
        }
      } else {
        console.debug("[SCREEN_SHARE_DIAG] No source ID received (null), keeping existing", {
          existing: this.#selectedScreenShareSource,
          note: "Source ID was already set correctly by setupScreenSharing()"
        });
      }

      console.debug("[SCREEN_SHARE_DIAG] Screen sharing source registered", {
        sourceId: this.#selectedScreenShareSource,
        sourceType: this.#selectedScreenShareSource?.startsWith?.('screen:') ? 'screen' : 'window',
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
      stoppedSource: this.#selectedScreenShareSource,
      previewWindowExists: this.#previewWindow && !this.#previewWindow.isDestroyed(),
      mainWindowState: {
        visible: this.#mainWindow?.isVisible?.() || false,
        focused: this.#mainWindow?.isFocused?.() || false
      }
    });

    this.#selectedScreenShareSource = null;

    // Close preview window when screen sharing stops
    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      console.debug("[SCREEN_SHARE_DIAG] Closing preview window after screen sharing stopped");
      this.#previewWindow.close();
    } else {
      console.debug("[SCREEN_SHARE_DIAG] No preview window to close");
    }
  }

  /**
   * IPC handler for getting screen sharing status
   * @private
   */
  #handleGetScreenSharingStatus() {
    return this.#selectedScreenShareSource !== null;
  }

  /**
   * IPC handler for getting screen share stream source ID
   * @private
   */
  #handleGetScreenShareStream() {
    // Return the source ID - handle both string and object formats
    if (typeof this.#selectedScreenShareSource === "string") {
      return this.#selectedScreenShareSource;
    } else if (this.#selectedScreenShareSource?.id) {
      return this.#selectedScreenShareSource.id;
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

  /**
   * IPC handler for resizing preview window
   * @private
   */
  #handleResizePreviewWindow(event, { width, height }) {
    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      const [minWidth, minHeight] = this.#previewWindow.getMinimumSize();
      const newWidth = Math.max(minWidth, Math.min(width, 480));
      const newHeight = Math.max(minHeight, Math.min(height, 360));
      this.#previewWindow.setSize(newWidth, newHeight);
      this.#previewWindow.center();
    }
  }

  /**
   * IPC handler for stopping screen sharing from thumbnail
   * @private
   */
  #handleStopScreenSharingFromThumbnail() {
    this.#selectedScreenShareSource = null;
    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      this.#previewWindow.webContents.send("screen-sharing-status-changed");
    }
  }

  /**
   * Show screen/window picker dialog
   *
   * Prevents race conditions by ensuring only one picker window is open at a time.
   * If a picker is already open, focuses it and returns null.
   *
   * @private
   * @param {Array} sources - Array of available desktop capturer sources
   * @returns {Promise<Object|null>} Selected source or null if cancelled/already open
   */
  #showScreenPicker(sources) {
    // Guard: prevent multiple picker windows
    if (this.#picker) {
      console.warn("[SCREEN_PICKER] Picker already open, focusing existing window");
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

      // Store handler reference for proper cleanup
      const onSourceSelected = (_event, source) => {
        resolve(source);
        if (this.#picker) {
          this.#picker.close();
        }
      };

      ipcMain.once("source-selected", onSourceSelected);

      this.#picker.on("closed", () => {
        // Clean up IPC listener to prevent memory leaks
        ipcMain.removeListener("source-selected", onSourceSelected);
        this.#picker = null;
        resolve(null);
      });
    });
  }
}

module.exports = ScreenSharingService;

import { ipcMain, BrowserWindow, desktopCapturer, screen } from "electron";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";

const __dirname = getDirname(import.meta.url);

class ScreenSharingService {
	#mainWindow;
	#picker = null;
	#selectedScreenShareSource = null;
	#previewWindow = null;

	constructor(mainWindow) {
		this.#mainWindow = mainWindow;
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

	async #handleGetDesktopCapturerSources(_event, opts) {
		return desktopCapturer.getSources(opts);
	}

	async #handleChooseDesktopMedia(_event, sourceTypes) {
		const sources = await desktopCapturer.getSources({ types: sourceTypes });
		const chosen = await this.#showScreenPicker(sources);
		return chosen ? chosen.id : null;
	}

	#handleCancelDesktopMedia() {
		if (this.#picker) {
			this.#picker.close();
		}
	}

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

	#handleGetScreenSharingStatus() {
		return this.#selectedScreenShareSource !== null;
	}

	#handleGetScreenShareStream() {
		// Return the source ID - handle both string and object formats
		if (typeof this.#selectedScreenShareSource === "string") {
			return this.#selectedScreenShareSource;
		} else if (this.#selectedScreenShareSource?.id) {
			return this.#selectedScreenShareSource.id;
		}
		return null;
	}

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

	#handleResizePreviewWindow(event, { width, height }) {
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

export default ScreenSharingService;

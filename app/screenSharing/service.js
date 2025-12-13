import { ipcMain } from "electron";

/**
 * ScreenSharingService manages screen sharing state and IPC communication.
 * It tracks the currently selected source and preview window state.
 */
class ScreenSharingService {
	/**
	 * @param {Object} mainAppWindow - Main application window module
	 */
	constructor(mainAppWindow) {
		this.mainAppWindow = mainAppWindow;
		this.selectedSource = null;
		this.previewWindow = null;
	}

	/**
	 * Initialize IPC handlers for screen sharing events
	 */
	initialize() {
		// Handle screen sharing started event from renderer
		ipcMain.on("screen-sharing-started", this.handleScreenSharingStarted.bind(this));
		// Handle screen sharing stopped event from renderer
		ipcMain.on("screen-sharing-stopped", this.handleScreenSharingStopped.bind(this));
		// Handle stop sharing from thumbnail preview window
		ipcMain.on("stop-screen-sharing-from-thumbnail", this.handleStopFromThumbnail.bind(this));
		// Get screen sharing preview source for thumbnail window
		ipcMain.handle("get-screen-sharing-preview-source", this.handleGetPreviewSource.bind(this));
	}

	/**
	 * Handle screen sharing started event
	 * @param {Electron.IpcMainEvent} _event - IPC event
	 * @param {string} sourceId - The selected source ID
	 */
	handleScreenSharingStarted(_event, sourceId) {
		console.debug("[SCREEN_SHARE] Screen sharing started with source:", sourceId);
	}

	/**
	 * Handle screen sharing stopped event
	 * @param {Electron.IpcMainEvent} _event - IPC event
	 */
	handleScreenSharingStopped(_event) {
		console.debug("[SCREEN_SHARE] Screen sharing stopped");
		this.closePreviewWindow();
	}

	/**
	 * Handle stop sharing request from thumbnail preview
	 * @param {Electron.IpcMainEvent} _event - IPC event
	 */
	handleStopFromThumbnail(_event) {
		console.debug("[SCREEN_SHARE] Stop sharing requested from thumbnail");
		
		// Close the preview window
		this.closePreviewWindow();
		
		// Notify the main window to stop sharing
		const mainWindow = this.mainAppWindow.getWindow();
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("stop-screen-sharing");
		}
	}

	/**
	 * Handle get preview source request
	 * @returns {Object|null} The selected source or null
	 */
	async handleGetPreviewSource() {
		return this.selectedSource;
	}

	/**
	 * Close the preview window if it exists
	 */
	closePreviewWindow() {
		if (this.previewWindow && !this.previewWindow.isDestroyed()) {
			console.debug("[SCREEN_SHARE] Closing preview window");
			this.previewWindow.close();
		}
		this.previewWindow = null;
		this.selectedSource = null;
	}

	/**
	 * Get the currently selected source
	 * @returns {Object|null} The selected source or null
	 */
	getSelectedSource() {
		return this.selectedSource;
	}

	/**
	 * Set the currently selected source
	 * @param {Object|null} source - The source to set
	 */
	setSelectedSource(source) {
		this.selectedSource = source;
	}

	/**
	 * Get the preview window
	 * @returns {BrowserWindow|null} The preview window or null
	 */
	getPreviewWindow() {
		return this.previewWindow;
	}

	/**
	 * Set the preview window
	 * @param {BrowserWindow|null} window - The preview window to set
	 */
	setPreviewWindow(window) {
		this.previewWindow = window;
	}
}

export default ScreenSharingService;

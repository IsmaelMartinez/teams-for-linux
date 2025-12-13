import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";

const __dirname = getDirname(import.meta.url);

/**
 * NotificationToast manages a custom toast notification window.
 */
class NotificationToast {
	/**
	 * @param {Object} config - Application configuration
	 */
	constructor(config) {
		this.config = config;
		this.window = null;
		this.hideTimeout = null;
		this.toastDuration = config.customNotification?.toastDuration || 5000;
	}

	/**
	 * Create the toast notification window
	 */
	createWindow() {
		if (this.window && !this.window.isDestroyed()) {
			return;
		}

		const display = screen.getPrimaryDisplay();
		const { width: screenWidth, height: screenHeight } = display.workAreaSize;
		const toastWidth = 350;
		const toastHeight = 100;
		const margin = 20;

		this.window = new BrowserWindow({
			width: toastWidth,
			height: toastHeight,
			x: screenWidth - toastWidth - margin,
			y: screenHeight - toastHeight - margin,
			frame: false,
			transparent: true,
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			show: false,
			focusable: false,
			webPreferences: {
				preload: path.join(__dirname, "notificationToastPreload.js"),
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		this.window.loadFile(path.join(__dirname, "notificationToast.html"));

		this.window.on("closed", () => {
			this.window = null;
		});
	}

	/**
	 * Show a toast notification
	 * @param {Object} data - Notification data
	 */
	show(data) {
		this.createWindow();

		if (!this.window || this.window.isDestroyed()) {
			console.error("NotificationToast: Failed to create window");
			return;
		}

		// Clear any existing hide timeout
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		// Send notification data to the toast window
		this.window.webContents.send("notification-data", data);
		this.window.showInactive();

		// Auto-hide after duration
		this.hideTimeout = setTimeout(() => {
			this.hide();
		}, this.toastDuration);
	}

	/**
	 * Hide the toast notification
	 */
	hide() {
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		if (this.window && !this.window.isDestroyed()) {
			this.window.hide();
		}
	}

	/**
	 * Destroy the toast window
	 */
	destroy() {
		this.hide();
		if (this.window && !this.window.isDestroyed()) {
			this.window.destroy();
			this.window = null;
		}
	}
}

export default NotificationToast;

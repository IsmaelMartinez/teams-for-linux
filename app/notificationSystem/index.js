import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";
import NotificationToast from "./NotificationToast.js";

const __dirname = getDirname(import.meta.url);

/**
 * CustomNotificationManager handles custom in-app toast notifications.
 * This provides an alternative to system notifications with more control
 * over appearance and behavior.
 */
class CustomNotificationManager {
	/**
	 * @param {Object} config - Application configuration
	 * @param {Object} mainAppWindow - Main application window module
	 */
	constructor(config, mainAppWindow) {
		this.config = config;
		this.mainAppWindow = mainAppWindow;
		this.toastWindow = null;
		this.notificationToast = null;
	}

	/**
	 * Initialize IPC handlers for custom notifications
	 */
	initialize() {
		// Show custom notification toast
		ipcMain.on("notification-show-toast", this.handleShowToast.bind(this));
		// Close notification toast
		ipcMain.on("notification-close-toast", this.handleCloseToast.bind(this));
		// Handle toast click (focus main window)
		ipcMain.on("notification-toast-clicked", this.handleToastClicked.bind(this));

		// Initialize the notification toast window
		this.initializeToastWindow();
	}

	/**
	 * Initialize the toast notification window
	 */
	initializeToastWindow() {
		if (this.config.notificationMethod !== "custom") {
			return;
		}

		this.notificationToast = new NotificationToast(this.config);
	}

	/**
	 * Handle showing a toast notification
	 * @param {Electron.IpcMainEvent} _event - IPC event
	 * @param {Object} data - Notification data
	 */
	handleShowToast(_event, data) {
		if (this.config.disableNotifications) {
			console.debug("Notifications are disabled");
			return;
		}

		if (this.notificationToast) {
			this.notificationToast.show(data);
		}
	}

	/**
	 * Handle closing the toast notification
	 * @param {Electron.IpcMainEvent} _event - IPC event
	 */
	handleCloseToast(_event) {
		if (this.notificationToast) {
			this.notificationToast.hide();
		}
	}

	/**
	 * Handle toast click - focus main window
	 * @param {Electron.IpcMainEvent} _event - IPC event
	 */
	handleToastClicked(_event) {
		const window = this.mainAppWindow.getWindow();
		if (window) {
			if (window.isMinimized()) {
				window.restore();
			}
			window.show();
			window.focus();
		}

		if (this.notificationToast) {
			this.notificationToast.hide();
		}
	}
}

export default CustomNotificationManager;

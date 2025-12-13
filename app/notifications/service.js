import { Notification, ipcMain, app } from "electron";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";

const __dirname = getDirname(import.meta.url);

/**
 * NotificationService handles all desktop notification functionality.
 * This service manages showing notifications, playing sounds, and coordinating
 * with the main window for notification-related tasks.
 */
class NotificationService {
	/**
	 * @param {Object} player - Audio player instance for notification sounds
	 * @param {Object} config - Application configuration
	 * @param {Object} mainAppWindow - Main application window module
	 * @param {Function} getUserStatus - Function to get current user status
	 */
	constructor(player, config, mainAppWindow, getUserStatus) {
		this.player = player;
		this.config = config;
		this.mainAppWindow = mainAppWindow;
		this.getUserStatus = getUserStatus;
	}

	/**
	 * Initialize IPC handlers for notification-related events
	 */
	initialize() {
		// Show desktop notification with customizable options
		ipcMain.handle("show-notification", this.handleShowNotification.bind(this));
		// Play notification sound based on notification type
		ipcMain.handle("play-notification-sound", this.handlePlayNotificationSound.bind(this));
	}

	/**
	 * Handle showing a desktop notification
	 * @param {Electron.IpcMainInvokeEvent} _event - IPC event
	 * @param {Object} options - Notification options (title, body, icon, etc.)
	 */
	async handleShowNotification(_event, options) {
		if (this.config.disableNotifications) {
			console.debug("Notifications are disabled");
			return;
		}

		const notification = new Notification({
			title: options.title || "Teams for Linux",
			body: options.body || "",
			icon: options.icon || path.join(__dirname, "../assets/icons/icon-96x96.png"),
			urgency: this.config.defaultNotificationUrgency || "normal",
		});

		notification.on("click", () => {
			const window = this.mainAppWindow.getWindow();
			if (window) {
				if (window.isMinimized()) {
					window.restore();
				}
				window.show();
				window.focus();
			}
		});

		notification.show();

		// Flash window if enabled
		if (!this.config.disableNotificationWindowFlash) {
			const window = this.mainAppWindow.getWindow();
			if (window && !window.isFocused()) {
				window.flashFrame(true);
			}
		}
	}

	/**
	 * Handle playing notification sound
	 * @param {Electron.IpcMainInvokeEvent} _event - IPC event
	 * @param {Object} options - Sound options (type, audio)
	 */
	async handlePlayNotificationSound(_event, options) {
		// Check if sound is disabled
		if (this.config.disableNotificationSound) {
			console.debug("Notification sound is disabled");
			return;
		}

		// Check if sound should be disabled when not available
		if (this.config.disableNotificationSoundIfNotAvailable) {
			const userStatus = this.getUserStatus();
			// Status 1 = Available
			if (userStatus !== 1) {
				console.debug(`Notification sound disabled - user status is ${userStatus} (not Available)`);
				return;
			}
		}

		if (!this.player) {
			console.debug("No audio player available");
			return;
		}

		try {
			const soundType = options?.type || "new-message";
			const soundFile = this.getSoundFile(soundType);
			
			if (soundFile) {
				console.debug(`Playing notification sound: ${soundFile}`);
				this.player.play(soundFile);
			}
		} catch (error) {
			console.error("Error playing notification sound:", error);
		}
	}

	/**
	 * Get the sound file path for a given notification type
	 * @param {string} type - Notification type (new-message, meeting-started, etc.)
	 * @returns {string|null} Path to sound file or null if not found
	 */
	getSoundFile(type) {
		const soundsPath = app.isPackaged
			? path.join(process.resourcesPath, "assets/sounds")
			: path.join(__dirname, "../assets/sounds");

		const soundFiles = {
			"new-message": "new_message.wav",
			"meeting-started": "meeting_started.wav",
		};

		const fileName = soundFiles[type] || soundFiles["new-message"];
		return path.join(soundsPath, fileName);
	}
}

export default NotificationService;

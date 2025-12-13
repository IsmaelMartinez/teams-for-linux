import { powerMonitor, ipcMain } from "electron";

/**
 * IdleMonitor tracks system idle state and can automatically set
 * the user's status to "away" when the system becomes idle.
 */
class IdleMonitor {
	/**
	 * @param {Object} config - Application configuration
	 * @param {Function} getUserStatus - Function to get current user status
	 */
	constructor(config, getUserStatus) {
		this.config = config;
		this.getUserStatus = getUserStatus;
		this.idleCheckInterval = null;
		this.wasIdle = false;
	}

	/**
	 * Initialize IPC handlers and start idle monitoring if enabled
	 */
	initialize() {
		// Get current system idle time in seconds
		ipcMain.handle("get-idle-time", this.handleGetIdleTime.bind(this));
		// Check if system is currently idle
		ipcMain.handle("is-system-idle", this.handleIsSystemIdle.bind(this));

		// Start idle monitoring if enabled
		if (this.config.awayOnSystemIdle) {
			this.startIdleMonitoring();
		}
	}

	/**
	 * Start monitoring for system idle state
	 */
	startIdleMonitoring() {
		const checkInterval = (this.config.appIdleTimeoutCheckInterval || 10) * 1000;
		const idleThreshold = this.config.appIdleTimeout || 300;

		console.debug(`Starting idle monitoring with ${idleThreshold}s threshold, checking every ${checkInterval/1000}s`);

		this.idleCheckInterval = setInterval(() => {
			const idleTime = powerMonitor.getSystemIdleTime();
			const isIdle = idleTime >= idleThreshold;

			if (isIdle && !this.wasIdle) {
				console.debug(`System went idle after ${idleTime}s`);
				this.wasIdle = true;
				// Emit event for status change (handled by main process)
				ipcMain.emit("system-idle-changed", null, { idle: true, idleTime });
			} else if (!isIdle && this.wasIdle) {
				console.debug(`System became active after being idle for ${idleTime}s`);
				this.wasIdle = false;
				ipcMain.emit("system-idle-changed", null, { idle: false, idleTime });
			}
		}, checkInterval);
	}

	/**
	 * Stop idle monitoring
	 */
	stopIdleMonitoring() {
		if (this.idleCheckInterval) {
			clearInterval(this.idleCheckInterval);
			this.idleCheckInterval = null;
		}
	}

	/**
	 * Handle get idle time request
	 * @returns {number} System idle time in seconds
	 */
	async handleGetIdleTime() {
		return powerMonitor.getSystemIdleTime();
	}

	/**
	 * Handle is system idle request
	 * @returns {boolean} Whether the system is currently idle
	 */
	async handleIsSystemIdle() {
		const idleThreshold = this.config.appIdleTimeout || 300;
		return powerMonitor.getSystemIdleTime() >= idleThreshold;
	}
}

export default IdleMonitor;

import { ipcMain } from "electron";

/**
 * PartitionsManager handles partition-based settings like zoom levels.
 * Each partition can have its own zoom level that persists across sessions.
 */
class PartitionsManager {
	/**
	 * @param {Store} settingsStore - Electron store instance for settings persistence
	 */
	constructor(settingsStore) {
		this.settingsStore = settingsStore;
	}

	/**
	 * Initialize IPC handlers for partition-related events
	 */
	initialize() {
		// Get zoom level for a specific partition
		ipcMain.handle("get-zoom-level", this.handleGetZoomLevel.bind(this));
		// Save zoom level for a specific partition
		ipcMain.handle("save-zoom-level", this.handleSaveZoomLevel.bind(this));
	}

	/**
	 * Get zoom level for a partition
	 * @param {Electron.IpcMainInvokeEvent} _event - IPC event
	 * @param {string} partition - Partition identifier
	 * @returns {number} Zoom level (default: 0)
	 */
	async handleGetZoomLevel(_event, partition) {
		const key = `zoomLevel_${partition}`;
		return this.settingsStore.get(key, 0);
	}

	/**
	 * Save zoom level for a partition
	 * @param {Electron.IpcMainInvokeEvent} _event - IPC event
	 * @param {Object} data - Data containing partition and level
	 * @param {string} data.partition - Partition identifier
	 * @param {number} data.level - Zoom level to save
	 */
	async handleSaveZoomLevel(_event, data) {
		const { partition, level } = data;
		const key = `zoomLevel_${partition}`;
		this.settingsStore.set(key, level);
		console.debug(`Saved zoom level ${level} for partition ${partition}`);
	}
}

export default PartitionsManager;

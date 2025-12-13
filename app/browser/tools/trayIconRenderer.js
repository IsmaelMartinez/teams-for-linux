/**
 * TrayIconRenderer tool
 * 
 * Handles tray icon updates from the renderer process.
 * CRITICAL: This module needs ipcRenderer for IPC communication (see CLAUDE.md)
 */

const _TrayIconRenderer_config = new WeakMap();
const _TrayIconRenderer_ipcRenderer = new WeakMap();

class TrayIconRenderer {
	init(config, ipcRenderer) {
		_TrayIconRenderer_config.set(this, config);
		_TrayIconRenderer_ipcRenderer.set(this, ipcRenderer);

		// Listen for unread count changes
		globalThis.addEventListener("unread-count", (event) => {
			this.onUnreadCountChange(event.detail?.number || 0);
		});

		console.debug("[TrayIconRenderer] Initialized with IPC renderer");
	}

	get config() {
		return _TrayIconRenderer_config.get(this);
	}

	get ipcRenderer() {
		return _TrayIconRenderer_ipcRenderer.get(this);
	}

	/**
	 * Handle unread count change
	 * @param {number} count - The unread count
	 */
	onUnreadCountChange(count) {
		if (!this.ipcRenderer) {
			console.warn("[TrayIconRenderer] No IPC renderer available");
			return;
		}

		try {
			// Send update to main process
			this.ipcRenderer.send("tray-update", {
				icon: null,
				flash: count > 0 && !this.config.disableNotificationWindowFlash,
				count: count
			});

			// Also update badge count
			if (!this.config.disableBadgeCount) {
				this.ipcRenderer.invoke("set-badge-count", count).catch(err => {
					console.debug("[TrayIconRenderer] Badge count error:", err.message);
				});
			}
		} catch (err) {
			console.error("[TrayIconRenderer] Error updating tray:", err.message);
		}
	}
}

export default new TrayIconRenderer();

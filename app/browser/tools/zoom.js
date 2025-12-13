/**
 * Zoom tool
 * 
 * Handles zoom level management with keyboard shortcuts.
 */
class Zoom {
	init(config) {
		this.config = config;
		this.setupKeyboardShortcuts();
		this.loadZoomLevel();
	}

	/**
	 * Set up keyboard shortcuts for zoom
	 */
	setupKeyboardShortcuts() {
		document.addEventListener("keydown", (event) => {
			// Ctrl/Cmd + Plus: Zoom in
			if ((event.ctrlKey || event.metaKey) && (event.key === "+" || event.key === "=")) {
				event.preventDefault();
				this.zoomIn();
			}
			// Ctrl/Cmd + Minus: Zoom out
			else if ((event.ctrlKey || event.metaKey) && event.key === "-") {
				event.preventDefault();
				this.zoomOut();
			}
			// Ctrl/Cmd + 0: Reset zoom
			else if ((event.ctrlKey || event.metaKey) && event.key === "0") {
				event.preventDefault();
				this.resetZoom();
			}
		});

		// Handle mouse wheel zoom
		document.addEventListener("wheel", (event) => {
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				if (event.deltaY < 0) {
					this.zoomIn();
				} else {
					this.zoomOut();
				}
			}
		}, { passive: false });
	}

	/**
	 * Zoom in
	 */
	zoomIn() {
		const currentZoom = this.getZoom();
		const newZoom = Math.min(currentZoom + 0.1, 3);
		this.setZoom(newZoom);
	}

	/**
	 * Zoom out
	 */
	zoomOut() {
		const currentZoom = this.getZoom();
		const newZoom = Math.max(currentZoom - 0.1, 0.5);
		this.setZoom(newZoom);
	}

	/**
	 * Reset zoom to 100%
	 */
	resetZoom() {
		this.setZoom(1);
	}

	/**
	 * Get current zoom level
	 * @returns {number} Current zoom level
	 */
	getZoom() {
		return globalThis.electronAPI?.getZoomLevel 
			? 1 // Actual level would be retrieved async
			: document.body.style.zoom 
				? parseFloat(document.body.style.zoom) 
				: 1;
	}

	/**
	 * Set zoom level
	 * @param {number} level - Zoom level
	 */
	setZoom(level) {
		document.body.style.zoom = level;
		this.saveZoomLevel(level);
		console.debug(`[Zoom] Set to ${Math.round(level * 100)}%`);
	}

	/**
	 * Load saved zoom level
	 */
	async loadZoomLevel() {
		try {
			if (globalThis.electronAPI?.getZoomLevel) {
				const level = await globalThis.electronAPI.getZoomLevel(this.config.partition);
				if (level && level !== 0) {
					document.body.style.zoom = 1 + level * 0.1;
				}
			}
		} catch (err) {
			console.debug("[Zoom] Error loading zoom level:", err.message);
		}
	}

	/**
	 * Save zoom level
	 * @param {number} level - Zoom level
	 */
	async saveZoomLevel(level) {
		try {
			if (globalThis.electronAPI?.saveZoomLevel) {
				const zoomLevel = Math.round((level - 1) * 10);
				await globalThis.electronAPI.saveZoomLevel({
					partition: this.config.partition,
					level: zoomLevel
				});
			}
		} catch (err) {
			console.debug("[Zoom] Error saving zoom level:", err.message);
		}
	}
}

export default new Zoom();

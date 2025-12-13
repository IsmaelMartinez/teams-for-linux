/**
 * Shortcuts tool
 * 
 * Handles keyboard shortcuts in the renderer process.
 */
class Shortcuts {
	init(config) {
		this.config = config;
		this.setupShortcuts();
	}

	/**
	 * Set up keyboard shortcuts
	 */
	setupShortcuts() {
		document.addEventListener("keydown", (event) => {
			// F5: Reload
			if (event.key === "F5") {
				event.preventDefault();
				location.reload();
			}
			// Ctrl+R: Reload
			else if ((event.ctrlKey || event.metaKey) && event.key === "r") {
				event.preventDefault();
				location.reload();
			}
			// F12: Dev tools (handled by main process)
			// Alt+Left: Navigate back
			else if (event.altKey && event.key === "ArrowLeft") {
				event.preventDefault();
				if (globalThis.electronAPI?.navigateBack) {
					globalThis.electronAPI.navigateBack();
				}
			}
			// Alt+Right: Navigate forward
			else if (event.altKey && event.key === "ArrowRight") {
				event.preventDefault();
				if (globalThis.electronAPI?.navigateForward) {
					globalThis.electronAPI.navigateForward();
				}
			}
		});
	}
}

export default new Shortcuts();

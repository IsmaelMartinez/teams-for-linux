/**
 * Frameless tool
 * 
 * Handles frameless window dragging and controls.
 */
class Frameless {
	init(config) {
		this.config = config;

		if (!config.frame) {
			this.setupFramelessTweaks();
		}
	}

	/**
	 * Set up frameless window tweaks
	 */
	setupFramelessTweaks() {
		// Add CSS for draggable title bar area
		const style = document.createElement("style");
		style.textContent = `
			.teams-title-bar, [data-tid="app-header"] {
				-webkit-app-region: drag;
			}
			.teams-title-bar button, .teams-title-bar a,
			[data-tid="app-header"] button, [data-tid="app-header"] a {
				-webkit-app-region: no-drag;
			}
		`;
		document.head.appendChild(style);

		console.debug("[Frameless] Frameless window tweaks applied");
	}
}

export default new Frameless();

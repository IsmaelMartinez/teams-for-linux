/**
 * NavigationButtons tool
 * 
 * Updates navigation button states based on browser history.
 */
class NavigationButtons {
	init(config) {
		this.config = config;

		if (globalThis.electronAPI?.onNavigationStateChanged) {
			globalThis.electronAPI.onNavigationStateChanged((_event, canGoBack, canGoForward) => {
				this.updateNavigationState(canGoBack, canGoForward);
			});
		}

		console.debug("[NavigationButtons] Initialized");
	}

	/**
	 * Update navigation button states
	 * @param {boolean} canGoBack - Whether back navigation is possible
	 * @param {boolean} canGoForward - Whether forward navigation is possible
	 */
	updateNavigationState(canGoBack, canGoForward) {
		// Dispatch event for any UI components that need to know
		const event = new CustomEvent("navigation-state-update", {
			detail: { canGoBack, canGoForward }
		});
		globalThis.dispatchEvent(event);
	}
}

export default new NavigationButtons();

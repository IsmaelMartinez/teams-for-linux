/**
 * ReactHandler
 * 
 * Provides access to Teams' React internals for settings management.
 */
class ReactHandler {
	/**
	 * Get Teams V2 client preferences from React state
	 * @returns {Object|null} The client preferences or null if not found
	 */
	static getTeams2ClientPreferences() {
		try {
			// Teams V2 stores preferences in a React context
			// This is a best-effort attempt to access it
			const teamsRoot = document.getElementById("app");
			if (!teamsRoot) {
				console.debug("[ReactHandler] Teams root element not found");
				return null;
			}

			// Try to find React fiber
			const reactFiberKey = Object.keys(teamsRoot).find(
				key => key.startsWith("__reactFiber$")
			);

			if (!reactFiberKey) {
				console.debug("[ReactHandler] React fiber not found");
				return null;
			}

			// Navigate React fiber tree to find preferences
			// This is fragile and may break with Teams updates
			const fiber = teamsRoot[reactFiberKey];
			let current = fiber;
			let iterations = 0;
			const maxIterations = 100;

			while (current && iterations < maxIterations) {
				if (current.memoizedProps?.clientPreferences) {
					return current.memoizedProps.clientPreferences;
				}
				if (current.memoizedState?.clientPreferences) {
					return current.memoizedState.clientPreferences;
				}
				current = current.return;
				iterations++;
			}

			console.debug("[ReactHandler] Client preferences not found in fiber tree");
			return null;
		} catch (err) {
			console.error("[ReactHandler] Error accessing React state:", err.message);
			return null;
		}
	}
}

export default ReactHandler;

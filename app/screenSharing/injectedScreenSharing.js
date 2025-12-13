// This script is injected into Teams' web content to handle screen sharing
// It runs in the renderer process context (not preload)

(function() {
	'use strict';

	console.debug('[InjectedScreenSharing] Screen sharing script loaded');

	// Monitor for screen sharing state changes
	let isSharing = false;

	// Create a MutationObserver to watch for screen sharing UI elements
	const observer = new MutationObserver(() => {
		// Look for screen sharing indicators in Teams UI
		const sharingButton = document.querySelector('[data-cid="calling-screen-share"]');
		const isSharingNow = sharingButton?.getAttribute('aria-pressed') === 'true';

		if (isSharingNow !== isSharing) {
			isSharing = isSharingNow;
			console.debug('[InjectedScreenSharing] Sharing state changed:', isSharing);

			// Notify the application
			if (globalThis.electronAPI) {
				if (isSharing) {
					globalThis.electronAPI.sendScreenSharingStarted('unknown');
				} else {
					globalThis.electronAPI.sendScreenSharingStopped();
				}
			}
		}
	});

	// Start observing when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', startObserving);
	} else {
		startObserving();
	}

	function startObserving() {
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['aria-pressed']
		});
		console.debug('[InjectedScreenSharing] Started observing DOM');
	}
})();

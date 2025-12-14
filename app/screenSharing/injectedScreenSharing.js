(function () {
	let isScreenSharing = false;
	let activeStreams = [];
	let activeMediaTracks = [];

	// Helper function to disable audio in screen sharing constraints
	function disableAudioInConstraints(constraints, context) {
		if (constraints) {
			constraints.audio = false;
			if (constraints.systemAudio !== undefined) {
				constraints.systemAudio = "exclude";
			}
			console.debug(`[SCREEN_SHARE_DIAG] Audio disabled for ${context}`);
		}
	}

	// Monitor for screen sharing streams and detect when they stop
	function monitorScreenSharing() {
		// Hook into getDisplayMedia for screen sharing
		const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
			navigator.mediaDevices
		);

		navigator.mediaDevices.getDisplayMedia = function (constraints) {
			console.debug("[SCREEN_SHARE_DIAG] getDisplayMedia intercepted, disabling audio");
			
			// Force disable all audio in screen sharing to prevent echo issues
			disableAudioInConstraints(constraints, "getDisplayMedia");
			
			return originalGetDisplayMedia(constraints)
				.then((stream) => {
					console.debug(`[SCREEN_SHARE_DIAG] Screen sharing started via getDisplayMedia (${stream.getAudioTracks().length}a/${stream.getVideoTracks().length}v)`);
					handleScreenShareStream(stream, "getDisplayMedia");
					return stream;
				})
				.catch((error) => {
					console.error(`[SCREEN_SHARE_DIAG] getDisplayMedia failed: ${error.name} - ${error.message}`);
					throw error;
				});
		};

		// Also hook into getUserMedia for fallback detection
		const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
			navigator.mediaDevices
		);

		navigator.mediaDevices.getUserMedia = function (constraints) {
			// Check if this is a screen sharing stream - handle multiple constraint formats
			// IMPORTANT: Only match actual desktop capture, not regular video calls with deviceId
			const isScreenShare =
				constraints &&
				constraints.video &&
				// Electron format - explicit desktop capture
				(constraints.video.chromeMediaSource === "desktop" ||
					constraints.video.mandatory?.chromeMediaSource === "desktop" ||
					// Teams format - explicit screen share source ID
					constraints.video.chromeMediaSourceId ||
					constraints.video.mandatory?.chromeMediaSourceId);

			// NOTE: Removed generic deviceId.exact check - it was too broad and matched
			// regular video calls where Teams specifies which camera to use, causing
			// audio to be disabled incorrectly (issues #1871, #1896)

			if (isScreenShare) {
				console.debug("[SCREEN_SHARE_DIAG] Screen sharing getUserMedia detected, disabling audio");

				// Force disable audio for screen sharing streams to prevent echo
				disableAudioInConstraints(constraints, "getUserMedia screen sharing");
			}

			return originalGetUserMedia(constraints)
				.then((stream) => {
					if (isScreenShare) {
						console.debug(`[SCREEN_SHARE_DIAG] Screen sharing started via getUserMedia (${stream.getAudioTracks().length}a/${stream.getVideoTracks().length}v)`);
						handleScreenShareStream(stream, "getUserMedia");
					}

					return stream;
				})
				.catch((error) => {
					if (isScreenShare) {
						console.error(`[SCREEN_SHARE_DIAG] getUserMedia screen sharing failed: ${error.name} - ${error.message}`);
					}
					throw error;
				});
		};
	}

	// Centralized handler for screen sharing streams
	function handleScreenShareStream(stream, source) {
		console.debug(`[SCREEN_SHARE_DIAG] Processing stream from ${source} (${activeStreams.length} active)`);

		const electronAPI = globalThis.electronAPI;

		if (!electronAPI) {
			console.error("[SCREEN_SHARE_DIAG] electronAPI not available - cannot notify main process");
			return;
		}

		// Check if we're creating a duplicate session - this could cause issues
		if (isScreenSharing) {
			console.warn(`[SCREEN_SHARE_DIAG] Multiple screen sharing sessions detected - total: ${activeStreams.length + 1}`);
		}

		isScreenSharing = true;
		activeStreams.push(stream);
		
		console.debug(`[SCREEN_SHARE_DIAG] Stream registered (${activeStreams.length} total active)`);

		// Send screen sharing started event
		if (electronAPI.sendScreenSharingStarted) {
			console.debug(`[SCREEN_SHARE_DIAG] Sending screen-sharing-started event (preview window will open)`);
			console.debug(`[SCREEN_SHARE_DIAG] Not sending stream.id to preserve desktopCapturer source ID`);

			electronAPI.sendScreenSharingStarted(null);
			electronAPI.send("active-screen-share-stream", stream);
		}

		// Start UI monitoring for stop sharing buttons
		startUIMonitoring();

		// Track stream and tracks for cleanup when they end
		const trackingVideoTracks = stream.getVideoTracks();
		for (const [index, track] of trackingVideoTracks.entries()) {
			activeMediaTracks.push(track);

			track.addEventListener("ended", () => {
				console.debug(`[SCREEN_SHARE_DIAG] Video track ${index} ended`);
				// Check if all tracks have ended to trigger cleanup
				const allTracksEnded = activeMediaTracks.every(t => t.readyState === "ended");
				if (allTracksEnded && isScreenSharing) {
					console.debug("[SCREEN_SHARE_DIAG] All video tracks ended, stopping screen sharing");
					handleStreamEnd("video_track_ended");
				}
			});
		}
	}

	// Function to handle stream ending - used by UI button detection
	function handleStreamEnd(reason) {
		console.debug(`[SCREEN_SHARE_DIAG] Stream ending: ${reason} (${activeStreams.length} streams, ${activeMediaTracks.length} tracks)`);

		if (isScreenSharing) {
			isScreenSharing = false;
			console.debug("[SCREEN_SHARE_DIAG] Screen sharing stopped");

			const electronAPI = globalThis.electronAPI;
			if (electronAPI?.sendScreenSharingStopped) {
				console.debug(`[SCREEN_SHARE_DIAG] Sending screen-sharing-stopped event (${reason})`);
				electronAPI.sendScreenSharingStopped();
			}

			// Clear active streams and tracks
			activeStreams = [];
			activeMediaTracks = [];
			
			console.debug("[SCREEN_SHARE_DIAG] Cleared all active streams and tracks");
		}
	}

	// Handle stop sharing button click
	function handleStopButtonClick(button) {
		console.debug(`[SCREEN_SHARE_DIAG] Stop sharing button clicked: "${button.textContent?.trim()}"`);    
		setTimeout(() => {
			handleStreamEnd("stop_button_clicked");
		}, 100);
	}

	// Set up monitoring for a single stop button
	function setupStopButtonMonitoring(button) {
		if (!button.dataset.teamsMonitored) {
			button.dataset.teamsMonitored = "true";
			console.debug(`[SCREEN_SHARE_DIAG] Monitoring stop button: "${button.textContent?.trim()}"`);
			
			button.addEventListener("click", () => handleStopButtonClick(button));
		}
	}

	// Track whether stop button exists in current UI state
	let stopButtonExists = false;

	// Process discovered stop sharing buttons
	function processStopSharingButtons() {
		// Look for various "Stop sharing" button patterns
		const stopButtons = [
			...document.querySelectorAll('[data-tid="stop-sharing-button"]'),
			...document.querySelectorAll('button[title*="Stop sharing"]'),
			...document.querySelectorAll('button[aria-label*="Stop sharing"]'),
			// More generic patterns
			...document.querySelectorAll('button[class*="stop-sharing"]'),
			...document.querySelectorAll('[id*="stop-sharing"]'),
		];

		const hadStopButton = stopButtonExists;
		stopButtonExists = stopButtons.length > 0;

		// If stop button was present but now disappeared while screen sharing is active,
		// the meeting likely ended - trigger cleanup
		if (hadStopButton && !stopButtonExists && isScreenSharing) {
			console.debug("[SCREEN_SHARE_DIAG] Stop sharing button disappeared - meeting likely ended");
			handleStreamEnd("meeting_ended_button_removed");
			return;
		}

		for (const button of stopButtons) {
			setupStopButtonMonitoring(button);
		}
	}

	// Start monitoring UI for "Stop sharing" buttons
	function startUIMonitoring() {
		console.debug("[SCREEN_SHARE_DIAG] Starting UI monitoring for stop buttons");

		const observer = new MutationObserver(processStopSharingButtons);

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'data-tid', 'title', 'aria-label']
		});

		// Initial check to detect current button state
		processStopSharingButtons();
	}

	// Initialize monitoring when the page is ready
	function initializeScreenSharingMonitoring() {
		console.debug("[SCREEN_SHARE_DIAG] Initializing screen sharing monitoring");

		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", monitorScreenSharing);
		} else {
			monitorScreenSharing();
		}
	}

	initializeScreenSharingMonitoring();
})();

/**
 * Speaking Indicator Browser Tool
 *
 * Provides a visual overlay showing microphone state during Teams calls.
 * Intercepts RTCPeerConnection and polls getStats() every 150ms to read
 * media-source.audioLevel — the actual audio level Teams feeds into the
 * WebRTC encoder, reflecting its internal mute state.
 *
 * The overlay is driven entirely by WebRTC stats rather than call lifecycle
 * events (call-connected/call-disconnected), making it resilient to changes
 * in Teams' internal React event emission. It appears automatically when
 * audio stats are detected and disappears when all connections close.
 *
 * Overlay states:
 * - Green (pulsing): speaking — audio is being transmitted
 * - Grey: silent — mic is open but quiet
 * - Red: muted — Teams has zeroed the audio signal
 *
 * Teams zeroes media-source.audioLevel to exactly 0.0 when muted,
 * making three-state detection (speaking/silent/muted) reliable.
 */
const activityHub = require('./activityHub');

const LOG_PREFIX = '[SPEAKING_INDICATOR]';
const POLL_INTERVAL_MS = 150;
const SPEAKING_THRESHOLD = 0.01;  // audioLevel above this → speaking
const MUTED_LEVEL = 0.0001;       // audioLevel below this → muted (Teams zeroes signal exactly)
const OVERLAY_ID = 'speaking-indicator-overlay';
const STYLES_ID = 'speaking-indicator-styles';

class SpeakingIndicator {
	#state = 'silent'; // 'speaking' | 'silent' | 'muted'
	#peerConnections = [];
	#pollInterval = null;
	#polling = false;
	#overlayVisible = false;
	#hasSeenAudio = false; // true once audioLevel > 0 — prevents pre-join zeros reading as muted

	init(config) {
		const enabled = config.media?.microphone?.speakingIndicator;
		if (!enabled) {
			return;
		}

		try {
			this.#patchRTCPeerConnection();
			this.#registerCallEvents();
			console.info(`${LOG_PREFIX} Initialized`);
		} catch (error) {
			console.error(`${LOG_PREFIX} Failed to initialize:`, error);
		}
	}

	#patchRTCPeerConnection() {
		const Orig = globalThis.RTCPeerConnection;
		if (!Orig) {
			console.warn(`${LOG_PREFIX} RTCPeerConnection not available`);
			return;
		}

		const onCreated = this.#onPeerConnectionCreated.bind(this);
		function PatchedRTC(...args) {
			const pc = new Orig(...args);
			onCreated(pc);
			return pc;
		}
		PatchedRTC.prototype = Orig.prototype;
		Object.setPrototypeOf(PatchedRTC, Orig);
		globalThis.RTCPeerConnection = PatchedRTC;
		console.info(`${LOG_PREFIX} Patched RTCPeerConnection`);
	}

	#onPeerConnectionCreated(pc) {
		this.#peerConnections.push(pc);
		console.info(`${LOG_PREFIX} RTCPeerConnection created (total: ${this.#peerConnections.length})`);
		if (!this.#pollInterval) {
			this.#startPolling();
		}
	}

	#registerCallEvents() {
		// call-disconnected used as a cleanup hint only — the poll loop is the
		// primary driver of overlay visibility.
		activityHub.on('call-connected', () => {
			console.info(`${LOG_PREFIX} call-connected event received`);
		});

		activityHub.on('call-disconnected', () => {
			console.info(`${LOG_PREFIX} call-disconnected event received, clearing connections`);
			this.#peerConnections = [];
			this.#hasSeenAudio = false;
			this.#stopPolling();
			this.#hideOverlay();
		});
	}

	#startPolling() {
		this.#pollInterval = setInterval(() => { this.#poll(); }, POLL_INTERVAL_MS);
		console.info(`${LOG_PREFIX} Polling started`);
	}

	#stopPolling() {
		if (this.#pollInterval) {
			clearInterval(this.#pollInterval);
			this.#pollInterval = null;
		}
		this.#polling = false;
		this.#state = 'silent';
		console.info(`${LOG_PREFIX} Polling stopped`);
	}

	async #poll() {
		if (this.#polling) {
			return;
		}
		this.#polling = true;

		// Remove closed connections
		this.#peerConnections = this.#peerConnections.filter(
			pc => pc.connectionState !== 'closed'
		);

		if (this.#peerConnections.length === 0) {
			this.#polling = false;
			if (this.#overlayVisible) {
				console.info(`${LOG_PREFIX} No active connections, hiding overlay`);
				this.#hideOverlay();
			}
			return;
		}

		let foundAudioStats = false;

		try {
			for (const pc of this.#peerConnections) {
				let report;
				try {
					report = await pc.getStats();
				} catch {
					continue;
				}

				report.forEach(stat => {
					if (stat.type !== 'media-source' || stat.kind !== 'audio') {
						return;
					}
					const level = stat.audioLevel;
					if (typeof level !== 'number') {
						return;
					}

					foundAudioStats = true;

					if (level >= MUTED_LEVEL) {
						this.#hasSeenAudio = true;
					}

					// Only interpret zero as muted once we've seen non-zero audio.
					// Before that, zero means the connection is still setting up (pre-join).
					let newState;
					if (level >= SPEAKING_THRESHOLD) {
						newState = 'speaking';
					} else if (level < MUTED_LEVEL && this.#hasSeenAudio) {
						newState = 'muted';
					} else {
						newState = 'silent';
					}

					if (newState !== this.#state) {
						console.info(`${LOG_PREFIX} State: ${this.#state} → ${newState} (audioLevel=${level.toFixed(5)})`);
						this.#state = newState;
						if (this.#overlayVisible) {
							this.#updateOverlay();
						}
					}
				});

				if (foundAudioStats) {
					break; // Use the first connection that has audio stats
				}
			}
		} finally {
			this.#polling = false;
		}

		if (foundAudioStats && !this.#overlayVisible) {
			console.info(`${LOG_PREFIX} Audio stats detected, showing overlay`);
			this.#showOverlay();
		} else if (!foundAudioStats && this.#overlayVisible) {
			console.info(`${LOG_PREFIX} No audio stats found, hiding overlay`);
			this.#hideOverlay();
		}
	}

	#showOverlay() {
		this.#overlayVisible = true;

		if (document.getElementById(OVERLAY_ID)) {
			return;
		}

		this.#injectStyles();

		const overlay = document.createElement('div');
		overlay.id = OVERLAY_ID;
		overlay.classList.add(this.#state);
		document.body.appendChild(overlay);

		console.info(`${LOG_PREFIX} Overlay shown (state: ${this.#state})`);
	}

	#hideOverlay() {
		this.#overlayVisible = false;
		this.#state = 'silent';

		const overlay = document.getElementById(OVERLAY_ID);
		if (overlay) {
			overlay.remove();
		}

		const styles = document.getElementById(STYLES_ID);
		if (styles) {
			styles.remove();
		}

		console.info(`${LOG_PREFIX} Overlay hidden`);
	}

	#updateOverlay() {
		const overlay = document.getElementById(OVERLAY_ID);
		if (!overlay) {
			return;
		}

		overlay.classList.remove('speaking', 'silent', 'muted');
		overlay.classList.add(this.#state);
	}

	#injectStyles() {
		if (document.getElementById(STYLES_ID)) {
			return;
		}

		const style = document.createElement('style');
		style.id = STYLES_ID;
		style.textContent = `
			#${OVERLAY_ID} {
				position: fixed;
				bottom: 20px;
				right: 20px;
				width: 24px;
				height: 24px;
				border-radius: 50%;
				z-index: 999999;
				pointer-events: none;
				transition: background-color 0.2s ease;
			}
			#${OVERLAY_ID}.speaking {
				background-color: #4caf50;
				animation: speaking-pulse 1s ease-in-out infinite;
			}
			#${OVERLAY_ID}.silent {
				background-color: #555;
			}
			#${OVERLAY_ID}.muted {
				background-color: #c62828;
			}
			@keyframes speaking-pulse {
				0%, 100% { transform: scale(1); opacity: 1; }
				50% { transform: scale(1.2); opacity: 0.8; }
			}
		`;
		document.head.appendChild(style);
	}
}

module.exports = new SpeakingIndicator();

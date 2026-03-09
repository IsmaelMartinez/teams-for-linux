/**
 * Speaking Indicator Browser Tool
 *
 * Provides a visual overlay indicator showing microphone state during Teams calls.
 * Intercepts getUserMedia to monitor audio levels via AnalyserNode and detects
 * mute state by polling track.enabled. Listens for call lifecycle events from
 * activityHub to show/hide the overlay automatically.
 *
 * Overlay states:
 * - Green (pulsing): actively speaking
 * - Grey: silent / not speaking
 * - Red: microphone muted
 */
const activityHub = require('./activityHub');

const LOG_PREFIX = '[SPEAKING_INDICATOR]';
const SILENCE_THRESHOLD = 15;
const AUDIO_SAMPLE_INTERVAL_MS = 100;
const MUTE_POLL_INTERVAL_MS = 200;
const OVERLAY_ID = 'speaking-indicator-overlay';
const STYLES_ID = 'speaking-indicator-styles';

class SpeakingIndicator {
	#ipcRenderer = null;
	#inCall = false;
	#isMuted = false;
	#isSpeaking = false;
	#audioContext = null;
	#analyser = null;
	#source = null;
	#dataArray = null;
	#currentTrack = null;
	#pendingStream = null;
	#audioInterval = null;
	#muteInterval = null;

	init(config, ipcRenderer) {
		const enabled = config.media?.microphone?.speakingIndicator;
		if (!enabled) {
			return;
		}

		this.#ipcRenderer = ipcRenderer;

		try {
			this.#patchGetUserMedia();
			this.#registerCallEvents();
			console.info(`${LOG_PREFIX} Initialized`);
		} catch (error) {
			console.error(`${LOG_PREFIX} Failed to initialize:`, error);
		}
	}

	#patchGetUserMedia() {
		const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
		const self = this;

		navigator.mediaDevices.getUserMedia = function getUserMedia(constraints) {
			return original(constraints).then((stream) => {
				if (constraints?.audio) {
					self.#onAudioStreamAcquired(stream);
				}
				return stream;
			});
		};

		console.debug(`${LOG_PREFIX} Patched getUserMedia`);
	}

	#registerCallEvents() {
		activityHub.on('call-connected', () => {
			console.info(`${LOG_PREFIX} Call connected`);
			this.#inCall = true;
			this.#showOverlay();
			// If a stream was captured before call-connected, start monitoring it now
			if (this.#pendingStream && !this.#audioContext) {
				this.#startAudioAnalysis(this.#pendingStream);
				this.#startMutePolling(this.#currentTrack);
				this.#pendingStream = null;
			}
		});

		activityHub.on('call-disconnected', () => {
			console.info(`${LOG_PREFIX} Call disconnected`);
			this.#inCall = false;
			this.#pendingStream = null;
			this.#stopMonitoring();
			this.#hideOverlay();
		});
	}

	#onAudioStreamAcquired(stream) {
		const audioTracks = stream.getAudioTracks();
		if (audioTracks.length === 0) {
			return;
		}

		// Clean up previous monitoring before starting new (handles device switching)
		this.#stopMonitoring();

		const track = audioTracks[0];
		this.#currentTrack = track;

		track.addEventListener('ended', () => {
			console.debug(`${LOG_PREFIX} Audio track ended`);
			this.#stopMonitoring();
		});

		if (this.#inCall) {
			this.#startAudioAnalysis(stream);
			this.#startMutePolling(track);
			console.debug(`${LOG_PREFIX} Audio monitoring started`);
		} else {
			// Store for when call-connected fires
			this.#pendingStream = stream;
			console.debug(`${LOG_PREFIX} Audio stream captured, waiting for call-connected`);
		}
	}

	#startAudioAnalysis(stream) {
		this.#audioContext = new AudioContext();
		this.#analyser = this.#audioContext.createAnalyser();
		this.#analyser.fftSize = 256;
		this.#analyser.smoothingTimeConstant = 0.3;

		this.#source = this.#audioContext.createMediaStreamSource(stream);
		this.#source.connect(this.#analyser);
		// Do NOT connect to destination — avoids feedback loop

		this.#dataArray = new Uint8Array(this.#analyser.frequencyBinCount);

		this.#audioInterval = setInterval(() => {
			if (!this.#inCall || this.#isMuted) {
				return;
			}

			this.#analyser.getByteFrequencyData(this.#dataArray);

			// Calculate RMS (same approach validated in spike)
			let sumOfSquares = 0;
			for (let i = 0; i < this.#dataArray.length; i++) {
				sumOfSquares += this.#dataArray[i] * this.#dataArray[i];
			}
			const rms = Math.sqrt(sumOfSquares / this.#dataArray.length);

			const wasSpeaking = this.#isSpeaking;
			this.#isSpeaking = rms > SILENCE_THRESHOLD;

			if (wasSpeaking !== this.#isSpeaking) {
				this.#updateOverlayState();
			}
		}, AUDIO_SAMPLE_INTERVAL_MS);
	}

	#startMutePolling(track) {
		let lastEnabled = track.enabled;

		this.#muteInterval = setInterval(() => {
			if (!this.#inCall) {
				return;
			}

			const currentEnabled = track.enabled;
			if (currentEnabled !== lastEnabled) {
				lastEnabled = currentEnabled;
				this.#isMuted = !currentEnabled;
				console.debug(`${LOG_PREFIX} Mute state changed: ${this.#isMuted ? 'muted' : 'unmuted'}`);

				// Send boolean 'enabled' to match MQTTMediaStatusService handler signature
				if (this.#ipcRenderer) {
					this.#ipcRenderer.send('microphone-state-changed', currentEnabled);
				}

				this.#updateOverlayState();
			}
		}, MUTE_POLL_INTERVAL_MS);
	}

	#stopMonitoring() {
		if (this.#audioInterval) {
			clearInterval(this.#audioInterval);
			this.#audioInterval = null;
		}

		if (this.#muteInterval) {
			clearInterval(this.#muteInterval);
			this.#muteInterval = null;
		}

		if (this.#source) {
			try {
				this.#source.disconnect();
			} catch {
				// Already disconnected
			}
			this.#source = null;
		}

		if (this.#audioContext) {
			try {
				this.#audioContext.close();
			} catch {
				// Already closed
			}
			this.#audioContext = null;
		}

		this.#analyser = null;
		this.#dataArray = null;
		this.#currentTrack = null;
		this.#isSpeaking = false;
		this.#isMuted = false;
	}

	#showOverlay() {
		if (document.getElementById(OVERLAY_ID)) {
			return;
		}

		this.#injectStyles();

		const overlay = document.createElement('div');
		overlay.id = OVERLAY_ID;
		overlay.classList.add('silent');
		document.body.appendChild(overlay);

		console.debug(`${LOG_PREFIX} Overlay shown`);
	}

	#hideOverlay() {
		const overlay = document.getElementById(OVERLAY_ID);
		if (overlay) {
			overlay.remove();
		}

		const styles = document.getElementById(STYLES_ID);
		if (styles) {
			styles.remove();
		}

		console.debug(`${LOG_PREFIX} Overlay hidden`);
	}

	#updateOverlayState() {
		const overlay = document.getElementById(OVERLAY_ID);
		if (!overlay) {
			return;
		}

		overlay.classList.remove('speaking', 'silent', 'muted');

		if (this.#isMuted) {
			overlay.classList.add('muted');
		} else if (this.#isSpeaking) {
			overlay.classList.add('speaking');
		} else {
			overlay.classList.add('silent');
		}
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
				background-color: #f44336;
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

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
 * Additionally, this module provides WebRTC-based call state detection as a
 * fallback for the React-based detection in activityHub. When all peer
 * connections close (e.g. hanging up from the popup window), it emits
 * call-disconnected through activityHub — fixing #2358 where the React
 * event doesn't fire for popup hang-ups.
 * The RTCPeerConnection patching activates when either the visual overlay
 * is enabled (media.microphone.speakingIndicator) or MQTT is enabled
 * (mqtt.enabled), ensuring reliable in-call detection for home automation.
 *
 * Overlay states:
 * - Green (pulsing): speaking — audio is being transmitted
 * - Grey: silent — mic is open but quiet
 * - Red: muted — Teams has zeroed the audio signal
 *
 * Teams zeroes media-source.audioLevel when the user mutes, and that is the
 * only mute signal WebRTC exposes: Teams leaves the sender's track enabled
 * (#3099).
 * A mic with its own noise reduction can also read zero while unmuted and
 * quiet (#2465), so that case shows as muted. A disabled track still counts
 * as muted in case Teams starts using it.
 *
 * When ipcRenderer is provided (always true today since the module is in
 * modulesRequiringIpc), the same state transitions are forwarded to the main
 * process via the `microphone-state-changed` IPC channel for MQTT publishing.
 * Values: 'speaking' | 'silent' | 'muted' | 'off' (off when the call ends).
 *
 * Camera state is also tracked: the poll loop checks video sender
 * track.enabled and forwards changes via `camera-state-changed` (boolean).
 * The main process mediaStatusService publishes this to {topicPrefix}/camera.
 */
const activityHub = require('./activityHub');

const LOG_PREFIX = '[SPEAKING_INDICATOR]';
const POLL_INTERVAL_MS = 150;
const SPEAKING_THRESHOLD = 0.01;  // audioLevel above this → speaking
const MUTED_LEVEL = 0.0001;       // audioLevel below this → muted candidate
// On quiet mics the unmuted noise floor can oscillate around MUTED_LEVEL, so
// require N consecutive below-threshold ticks before transitioning into muted.
// At 150ms polling, 3 ticks ≈ 450ms entry delay. Exit muted on a single tick
// above the threshold so unmuting feels immediate.
const MUTED_TICKS_REQUIRED = 3;
const OVERLAY_ID = 'speaking-indicator-overlay';
const STYLES_ID = 'speaking-indicator-styles';

class SpeakingIndicator {
	#state = 'silent'; // 'speaking' | 'silent' | 'muted'
	#peerConnections = [];
	#pollInterval = null;
	#polling = false;
	#overlayVisible = false;
	#overlayEnabled = false;
	#callLive = false; // true once audio is seen or the connection is up; pre-join zeros must not read as muted
	#mutedTicks = 0; // consecutive below-threshold ticks; required for silent → muted transition
	#inCall = false;
	#ipcRenderer = null;
	#lastEmittedState = null; // 'speaking' | 'silent' | 'muted' | 'off' | null
	#cameraEnabled = false;
	#lastEmittedCameraState = null; // true | false | null

	init(config, ipcRenderer) {
		const overlayEnabled = config.media?.microphone?.speakingIndicator === true;
		const mqttEnabled = config.mqtt?.enabled === true || (process.platform === 'linux' && config.dbusControl?.enabled === true);

		if (!overlayEnabled && !mqttEnabled) {
			return;
		}

		this.#overlayEnabled = overlayEnabled;
		this.#ipcRenderer = ipcRenderer || null;

		try {
			this.#patchRTCPeerConnection();
			this.#registerCallEvents();
			const mode = overlayEnabled ? 'overlay + call detection' : 'call detection only';
			console.info(`${LOG_PREFIX} Initialized (${mode})`);
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
		// React-based call events are used as hints; WebRTC polling is the
		// authoritative source for call state (fixes #2358).
		activityHub.on('call-connected', () => {
			console.info(`${LOG_PREFIX} call-connected event received`);
			this.#inCall = true;
		});

		activityHub.on('call-disconnected', () => {
			console.info(`${LOG_PREFIX} call-disconnected event received, clearing connections`);
			this.#inCall = false;
			this.#peerConnections = [];
			this.#stopPolling();
			this.#hideOverlay();
			this.#emitMicrophoneState('off');
			this.#emitCameraState(false);
		});
	}

	// Notifies main process of microphone state for MQTT publishing.
	#emitMicrophoneState(state) {
		if (!this.#ipcRenderer) {
			return;
		}
		if (this.#lastEmittedState === state) {
			return;
		}
		this.#lastEmittedState = state;
		this.#ipcRenderer.send('microphone-state-changed', state);
	}

	// Notifies main process of camera state for MQTT publishing.
	#emitCameraState(enabled) {
		if (!this.#ipcRenderer) {
			return;
		}
		if (this.#lastEmittedCameraState === enabled) {
			return;
		}
		this.#lastEmittedCameraState = enabled;
		this.#ipcRenderer.send('camera-state-changed', enabled);
	}

	#startPolling() {
		this.#pollInterval = setInterval(() => { this.#poll().catch(() => {}); }, POLL_INTERVAL_MS);
		console.info(`${LOG_PREFIX} Polling started`);
	}

	#stopPolling() {
		if (this.#pollInterval) {
			clearInterval(this.#pollInterval);
			this.#pollInterval = null;
		}
		this.#polling = false;
		this.#state = 'silent';
		this.#callLive = false;
		this.#mutedTicks = 0;
		console.info(`${LOG_PREFIX} Polling stopped`);
	}

	async #poll() {
		if (this.#polling) {
			return;
		}
		this.#polling = true;

		this.#peerConnections = this.#peerConnections.filter(
			pc => pc.connectionState !== 'closed'
		);

		if (this.#peerConnections.length === 0) {
			this.#polling = false;
			this.#handleAllConnectionsClosed();
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

				// One reading per poll, so the mute hysteresis counts polls rather
				// than stats; the loudest source wins so any live audio blocks muted.
				let level = null;
				report.forEach(stat => {
					if (stat.type === 'media-source' && stat.kind === 'audio' && typeof stat.audioLevel === 'number') {
						level = Math.max(level ?? 0, stat.audioLevel);
					}
				});

				if (level !== null) {
					this.#applyAudioLevel(pc, level);
					foundAudioStats = true;
					break; // Use the first connection that has audio stats
				}
			}
		} finally {
			this.#polling = false;
		}

		this.#updateCameraState();

		// WebRTC-based call-connected: audio stats detected with an established
		// connection. The connectionState check prevents premature emission during
		// pre-join setup when audio stats may appear with zero audioLevel. (#2358)
		const hasConnectedPeer = this.#peerConnections.some(pc => pc.connectionState === 'connected');
		if (foundAudioStats && hasConnectedPeer && !this.#inCall) {
			this.#inCall = true;
			console.info(`${LOG_PREFIX} Audio stats detected, emitting call-connected (WebRTC)`);
			activityHub.emit('call-connected');
		}

		if (foundAudioStats && !this.#overlayVisible && this.#overlayEnabled) {
			console.info(`${LOG_PREFIX} Audio stats detected, showing overlay`);
			this.#showOverlay();
		} else if (!foundAudioStats && this.#overlayVisible) {
			console.info(`${LOG_PREFIX} No audio stats found, hiding overlay`);
			this.#hideOverlay();
		}
	}

	#handleAllConnectionsClosed() {
		console.info(`${LOG_PREFIX} No active connections, stopping polling`);
		this.#stopPolling();
		this.#hideOverlay();
		this.#emitMicrophoneState('off');
		this.#emitCameraState(false);
		// WebRTC-based call-disconnected: all connections closed (#2358)
		if (this.#inCall) {
			this.#inCall = false;
			console.info(`${LOG_PREFIX} All connections closed, emitting call-disconnected (WebRTC)`);
			activityHub.emit('call-disconnected');
		}
	}

	#applyAudioLevel(pc, level) {
		const newState = this.#micStateFor(pc, level);

		if (newState !== this.#state) {
			console.info(`${LOG_PREFIX} State: ${this.#state} → ${newState} (audioLevel=${level.toFixed(5)})`);
			this.#state = newState;
			if (this.#overlayVisible) {
				this.#updateOverlay();
			}
		}
		this.#emitMicrophoneState(newState);
	}

	#micStateFor(pc, level) {
		// Zeros only mean muted once the call is live: either audio has been
		// seen or the connection is up (joining already muted never sends audio).
		if (level >= MUTED_LEVEL || pc.connectionState === 'connected') {
			this.#callLive = true;
		}
		// Hysteresis on the muted threshold: quiet-mic noise floors can
		// oscillate across MUTED_LEVEL, so only consecutive below-threshold
		// polls count.
		if (level < MUTED_LEVEL && this.#callLive) {
			this.#mutedTicks += 1;
		} else {
			this.#mutedTicks = 0;
		}

		let trackEnabled = true;
		try {
			const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
			if (audioSender?.track) {
				trackEnabled = audioSender.track.enabled;
			}
		} catch {
			// Fall through with trackEnabled = true.
		}

		if (!trackEnabled) return 'muted';
		if (level >= SPEAKING_THRESHOLD) return 'speaking';
		if (this.#mutedTicks >= MUTED_TICKS_REQUIRED) return 'muted';
		return 'silent';
	}

	// Camera state: check video sender track.enabled across all connections.
	// Filter out screen-sharing tracks (which have a displaySurface setting)
	// so only actual camera tracks are considered.
	#updateCameraState() {
		let cameraOn = false;
		for (const pc of this.#peerConnections) {
			try {
				const videoSender = pc.getSenders().find(s => {
					if (s.track?.kind !== 'video') return false;
					const settings = s.track.getSettings?.() || {};
					return !settings.displaySurface;
				});
				if (videoSender?.track?.enabled) {
					cameraOn = true;
					break;
				}
			} catch {
				// Ignore errors from closed connections.
			}
		}
		if (cameraOn !== this.#cameraEnabled) {
			this.#cameraEnabled = cameraOn;
			console.info(`${LOG_PREFIX} Camera: ${cameraOn ? 'on' : 'off'}`);
		}
		this.#emitCameraState(this.#cameraEnabled);
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

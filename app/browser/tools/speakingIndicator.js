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
 * - Red: muted — no audio is going out
 *
 * The outgoing audio sender is checked first: a disabled, muted, ended or
 * detached track, paused encodings, or a negotiated direction without "send"
 * read as muted at once. Teams can mute without touching any of these (the
 * track stays enabled, #3099), so otherwise media-source.audioLevel decides:
 * Teams zeroes it on mute. A mic with its own noise reduction can also read
 * zero while unmuted and quiet (#2465), so that case shows as muted. The raw
 * sender signals are logged at debug level whenever they change.
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
	#audioPc = null; // connection that last carried our outgoing audio level
	#audioTransceiver = null; // its transceiver, still judged once the track is detached
	#lastMuteSignals = ''; // serialized signals from the last debug line

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
		this.#audioPc = null;
		this.#audioTransceiver = null;
		this.#lastMuteSignals = '';
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

		let audioPc = null;
		let sources = [];

		try {
			for (const pc of this.#peerConnections) {
				let report;
				try {
					report = await pc.getStats();
				} catch {
					continue;
				}

				sources = this.#audioSourcesFrom(report);
				if (sources.length > 0) {
					audioPc = pc;
					break; // Use the first connection that has audio stats
				}
			}
		} finally {
			this.#polling = false;
		}

		const foundAudioStats = audioPc !== null;
		const hasMicState = this.#evaluateMic(audioPc, sources);

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

		if (hasMicState && !this.#overlayVisible && this.#overlayEnabled) {
			console.info(`${LOG_PREFIX} Audio stats detected, showing overlay`);
			this.#showOverlay();
		} else if (!hasMicState && this.#overlayVisible) {
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

	// Every outgoing audio source in a stats report as { level, trackId }.
	#audioSourcesFrom(report) {
		const sources = [];
		report.forEach(stat => {
			if (stat.type === 'media-source' && stat.kind === 'audio' && typeof stat.audioLevel === 'number') {
				sources.push({ level: stat.audioLevel, trackId: stat.trackIdentifier });
			}
		});
		return sources;
	}

	// Without stats, keep judging the transceiver that last carried audio:
	// detaching the track on mute removes its media-source stat, and the state
	// must not freeze. Returns true when there was something to judge.
	#evaluateMic(statsPc, sources) {
		if (!statsPc) {
			return this.#peerConnections.includes(this.#audioPc)
				&& this.#applyMicState(this.#audioPc, this.#audioTransceiver, null);
		}
		const { transceiver, level } = this.#pickMic(statsPc, sources);
		const newPc = statsPc !== this.#audioPc;
		// A report taken just before a detach still names the old track, which
		// no sender holds any more; keep the transceiver we already know.
		if (transceiver || newPc) {
			this.#audioTransceiver = transceiver;
		}
		// A replacement connection starts its own pre-join guard and zero streak.
		if (newPc) {
			this.#callLive = false;
			this.#mutedTicks = 0;
		}
		this.#audioPc = statsPc;
		return this.#applyMicState(statsPc, this.#audioTransceiver, level);
	}

	// The live microphone and its level, whatever order the report uses. The
	// transceiver prefers a sending one, so an idle sender that kept its track
	// cannot mask it. One level per poll, so the mute hysteresis counts polls;
	// it is the loudest source fed by a sending transceiver, so neither an idle
	// sender nor a stale source can hide a zeroed live mic or block muted.
	#pickMic(pc, sources) {
		const isLive = t => !this.#isSenderMuted(this.#audioSenderSignals(t));
		const matched = sources.map(s => ({ level: s.level, transceivers: this.#transceiversFor(pc, s.trackId) }));
		const live = matched.filter(m => m.transceivers.some(isLive));
		const transceiver = live.flatMap(m => m.transceivers).find(isLive)
			?? matched.flatMap(m => m.transceivers)[0] ?? null;
		const levels = (live.length ? live : matched).map(m => m.level);
		return { transceiver, level: Math.max(...levels) };
	}

	// Every audio transceiver whose sender holds the track: a new sending
	// transceiver can share the track an old idle one kept.
	#transceiversFor(pc, trackId) {
		try {
			const sending = pc.getTransceivers().filter(t => t.sender?.track?.kind === 'audio');
			if (trackId === undefined) {
				return sending.slice(0, 1); // No trackIdentifier: best guess.
			}
			return sending.filter(t => t.sender.track.id === trackId);
		} catch {
			return [];
		}
	}

	// Returns true when there was something to judge: an audio level, or the
	// audio transceiver that carried one before.
	#applyMicState(pc, transceiver, level) {
		const signals = this.#audioSenderSignals(transceiver);
		if (!signals.hasAudioTransceiver && level === null) {
			return false;
		}
		this.#logMuteSignals({ ...signals, hasAudioLevel: level !== null });

		const newState = this.#micStateFor(pc, signals, level);
		if (newState !== this.#state) {
			const levelText = level === null ? 'none' : level.toFixed(5);
			console.info(`${LOG_PREFIX} State: ${this.#state} → ${newState} (audioLevel=${levelText})`);
			this.#state = newState;
			if (this.#overlayVisible) {
				this.#updateOverlay();
			}
		}
		this.#emitMicrophoneState(newState);
		return true;
	}

	// A sender-side mute is definite; otherwise the audio level decides, with
	// hysteresis. A poll without a level leaves the zero streak as it was.
	#micStateFor(pc, signals, level) {
		if (level !== null) {
			this.#countMutedPoll(pc, level);
		}
		if (this.#isSenderMuted(signals)) return 'muted';
		if ((level ?? 0) >= SPEAKING_THRESHOLD) return 'speaking';
		if (this.#mutedTicks >= MUTED_TICKS_REQUIRED) return 'muted';
		return 'silent';
	}

	#countMutedPoll(pc, level) {
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
	}

	// Raw sender-side state of the outgoing audio m-line.
	#audioSenderSignals(transceiver) {
		if (!transceiver) {
			return { hasAudioTransceiver: false };
		}
		const track = transceiver.sender?.track ?? null;
		return {
			hasAudioTransceiver: true,
			trackPresent: track !== null,
			enabled: track?.enabled ?? null,
			muted: track?.muted ?? null,
			readyState: track?.readyState ?? null,
			encodingsActive: this.#encodingsActive(transceiver.sender),
			direction: transceiver.direction ?? null,
			currentDirection: transceiver.currentDirection ?? null,
		};
	}

	// false only when every encoding is paused; null when unknown. Polling
	// getParameters is safe: setParameters needs a getParameters result from
	// the same task, so a poll in its own task cannot invalidate a Teams update.
	#encodingsActive(sender) {
		try {
			const encodings = sender?.getParameters?.().encodings;
			return encodings?.length ? encodings.some(e => e.active !== false) : null;
		} catch {
			return null;
		}
	}

	// Any sender sign that no audio is going out. Only the negotiated
	// currentDirection says what is sending (direction is what the next offer
	// asks for), and it is null until negotiation finishes.
	#isSenderMuted(signals) {
		if (!signals.hasAudioTransceiver) return false;
		const sending = signals.currentDirection;
		return !signals.trackPresent
			|| signals.enabled === false
			|| signals.muted === true
			|| signals.readyState === 'ended'
			|| signals.encodingsActive === false
			|| (typeof sending === 'string' && !sending.includes('send'));
	}

	// One debug line per change, so a test call shows which signal Teams uses
	// on mute without logging every poll. Holds no labels or ids.
	#logMuteSignals(signals) {
		const serialized = JSON.stringify(signals);
		if (serialized === this.#lastMuteSignals) {
			return;
		}
		this.#lastMuteSignals = serialized;
		console.debug(`${LOG_PREFIX} Mute signals ${serialized}`);
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

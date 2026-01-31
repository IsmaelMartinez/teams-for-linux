/**
 * Media Privacy Browser Tool
 *
 * Provides screen lock media privacy functionality for Teams for Linux.
 * Allows users to disable/enable camera and microphone via MQTT commands,
 * enabling integration with screen lock scripts for privacy protection.
 *
 * Commands handled:
 * - disable-media: Stop all active camera and microphone tracks
 * - enable-media: Allow media requests again (re-enable getUserMedia)
 * - query-media-state: Return current media privacy state
 *
 * This follows the Linux-first philosophy of exposing commands that users
 * can wire into their own D-Bus listeners or systemd hooks.
 */

class MediaPrivacy {
	#ipcRenderer = null;
	#isMediaBlocked = false;
	#trackedStreams = new Set();
	#stoppedTracks = [];
	#originalGetUserMedia = null;

	/**
	 * Initialize the media privacy tool
	 * @param {Object} config - Application configuration
	 * @param {Object} ipcRenderer - Electron IPC renderer for main process communication
	 */
	init(config, ipcRenderer) {
		this.#ipcRenderer = ipcRenderer;

		// Only initialize if MQTT is enabled (this feature is MQTT-driven)
		if (!config.mqtt?.enabled) {
			console.debug('[MEDIA_PRIVACY] MQTT not enabled, skipping initialization');
			return;
		}

		this.#setupGetUserMediaTracking();
		this.#setupIpcListeners();

		console.info('[MEDIA_PRIVACY] Media privacy tool initialized');
	}

	/**
	 * Set up getUserMedia tracking to monitor active media streams
	 * This allows us to track and control all media streams created by Teams
	 */
	#setupGetUserMediaTracking() {
		// Store original getUserMedia for later use
		this.#originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

		// Create a proxy for getUserMedia to track streams
		const self = this;
		navigator.mediaDevices.getUserMedia = async function(constraints) {
			// Block new media requests if privacy mode is active
			if (self.#isMediaBlocked) {
				console.info('[MEDIA_PRIVACY] Blocking getUserMedia request - media privacy mode active');
				throw new DOMException('Media privacy mode is active', 'NotAllowedError');
			}

			// Get the stream using original method
			const stream = await self.#originalGetUserMedia(constraints);

			// Track this stream
			self.#trackStream(stream);

			return stream;
		};

		console.debug('[MEDIA_PRIVACY] getUserMedia tracking enabled');
	}

	/**
	 * Track a media stream and its tracks
	 * @param {MediaStream} stream - The media stream to track
	 */
	#trackStream(stream) {
		if (!stream || this.#trackedStreams.has(stream)) {
			return;
		}

		this.#trackedStreams.add(stream);

		// Listen for track additions to the stream
		stream.addEventListener('addtrack', (event) => {
			console.debug(`[MEDIA_PRIVACY] New ${event.track.kind} track added to stream`);
		});

		// Listen for track removals
		stream.addEventListener('removetrack', (event) => {
			console.debug(`[MEDIA_PRIVACY] ${event.track.kind} track removed from stream`);
		});

		console.debug(`[MEDIA_PRIVACY] Now tracking stream with ${stream.getTracks().length} tracks`);
	}

	/**
	 * Set up IPC listeners for media privacy commands from main process
	 */
	#setupIpcListeners() {
		// Listen for disable-media command
		this.#ipcRenderer.on('media-privacy:disable', () => {
			console.info('[MEDIA_PRIVACY] Received disable-media command');
			this.#disableMedia();
		});

		// Listen for enable-media command
		this.#ipcRenderer.on('media-privacy:enable', () => {
			console.info('[MEDIA_PRIVACY] Received enable-media command');
			this.#enableMedia();
		});

		// Listen for query-media-state command
		this.#ipcRenderer.on('media-privacy:query', (_event, requestId) => {
			console.debug('[MEDIA_PRIVACY] Received query-media-state command');
			const state = this.#getMediaState();
			this.#ipcRenderer.send('media-privacy:state', { requestId, state });
		});

		console.debug('[MEDIA_PRIVACY] IPC listeners registered');
	}

	/**
	 * Disable all active media (camera and microphone)
	 * Stops all active tracks and blocks new media requests
	 */
	#disableMedia() {
		if (this.#isMediaBlocked) {
			console.debug('[MEDIA_PRIVACY] Media already disabled');
			return;
		}

		this.#isMediaBlocked = true;
		this.#stoppedTracks = [];

		// Gather all streams to stop (tracked streams + video element streams)
		const streamsToStop = this.#getAllMediaStreams();

		// Stop all active tracks from all found streams
		for (const stream of streamsToStop) {
			for (const track of stream.getTracks()) {
				if (track.readyState === 'live') {
					this.#stoppedTracks.push({
						kind: track.kind,
						label: track.label,
						wasEnabled: track.enabled
					});
					track.stop();
					console.debug(`[MEDIA_PRIVACY] Stopped ${track.kind} track: ${track.label}`);
				}
			}
		}

		console.info(`[MEDIA_PRIVACY] Media disabled - stopped ${this.#stoppedTracks.length} tracks`);

		// Notify main process of state change
		this.#notifyStateChange();
	}

	/**
	 * Get all media streams from tracked streams and video elements
	 * @returns {Set<MediaStream>} Set of all unique media streams
	 */
	#getAllMediaStreams() {
		const streams = new Set(this.#trackedStreams);

		// Also find streams from video elements that might not be tracked
		const videoElements = document.querySelectorAll('video');
		for (const video of videoElements) {
			if (video.srcObject instanceof MediaStream) {
				streams.add(video.srcObject);
			}
		}

		return streams;
	}

	/**
	 * Enable media (allow new media requests)
	 * Note: This does NOT automatically restart stopped tracks, as that would
	 * require Teams to re-request media access
	 */
	#enableMedia() {
		if (!this.#isMediaBlocked) {
			console.debug('[MEDIA_PRIVACY] Media already enabled');
			return;
		}

		this.#isMediaBlocked = false;
		console.info('[MEDIA_PRIVACY] Media enabled - getUserMedia requests now allowed');
		console.info('[MEDIA_PRIVACY] Note: Previously stopped tracks must be restarted by Teams (toggle camera/mic in UI)');

		// Clear tracked streams as they're now stale
		this.#trackedStreams.clear();
		this.#stoppedTracks = [];

		// Notify main process of state change
		this.#notifyStateChange();
	}

	/**
	 * Get current media privacy state
	 * @returns {Object} Current state information
	 */
	#getMediaState() {
		const activeTracks = [];
		const processedTracks = new Set();

		// Get all streams (tracked + video elements) for accurate state
		const allStreams = this.#getAllMediaStreams();

		// Count active tracks from all unique streams
		for (const stream of allStreams) {
			for (const track of stream.getTracks()) {
				if (track.readyState === 'live' && !processedTracks.has(track)) {
					activeTracks.push({
						kind: track.kind,
						label: track.label,
						enabled: track.enabled
					});
					processedTracks.add(track);
				}
			}
		}

		return {
			isMediaBlocked: this.#isMediaBlocked,
			activeTrackCount: activeTracks.length,
			activeTracks: activeTracks,
			stoppedTrackCount: this.#stoppedTracks.length,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Notify main process of state change for MQTT publishing
	 */
	#notifyStateChange() {
		const state = this.#getMediaState();
		this.#ipcRenderer.send('media-privacy:state-changed', state);
	}
}

module.exports = new MediaPrivacy();

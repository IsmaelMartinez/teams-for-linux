/**
 * Media Privacy Browser Tool
 *
 * Provides screen lock media privacy via MQTT commands (disable-media, enable-media, query-media-state).
 */

class MediaPrivacy {
	#ipcRenderer = null;
	#isMediaBlocked = false;
	#trackedStreams = new Set();
	#stoppedTracks = [];
	#originalGetUserMedia = null;

	init(config, ipcRenderer) {
		this.#ipcRenderer = ipcRenderer;

		if (!config.mqtt?.enabled) {
			console.debug('[MEDIA_PRIVACY] MQTT not enabled, skipping initialization');
			return;
		}

		this.#setupGetUserMediaTracking();
		this.#setupIpcListeners();
		console.info('[MEDIA_PRIVACY] Media privacy tool initialized');
	}

	#setupGetUserMediaTracking() {
		this.#originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

		const self = this;
		navigator.mediaDevices.getUserMedia = async function(constraints) {
			if (self.#isMediaBlocked) {
				console.info('[MEDIA_PRIVACY] Blocking getUserMedia request - media privacy mode active');
				throw new DOMException('Media privacy mode is active', 'NotAllowedError');
			}

			const stream = await self.#originalGetUserMedia(constraints);
			self.#trackStream(stream);
			return stream;
		};

		console.debug('[MEDIA_PRIVACY] getUserMedia tracking enabled');
	}

	#trackStream(stream) {
		if (!stream || this.#trackedStreams.has(stream)) {
			return;
		}

		this.#trackedStreams.add(stream);

		stream.addEventListener('addtrack', (event) => {
			console.debug(`[MEDIA_PRIVACY] New ${event.track.kind} track added to stream`);
		});

		stream.addEventListener('removetrack', (event) => {
			console.debug(`[MEDIA_PRIVACY] ${event.track.kind} track removed from stream`);
		});

		console.debug(`[MEDIA_PRIVACY] Now tracking stream with ${stream.getTracks().length} tracks`);
	}

	#setupIpcListeners() {
		this.#ipcRenderer.on('media-privacy:disable', () => {
			console.info('[MEDIA_PRIVACY] Received disable-media command');
			this.#disableMedia();
		});

		this.#ipcRenderer.on('media-privacy:enable', () => {
			console.info('[MEDIA_PRIVACY] Received enable-media command');
			this.#enableMedia();
		});

		this.#ipcRenderer.on('media-privacy:query', (_event, requestId) => {
			console.debug('[MEDIA_PRIVACY] Received query-media-state command');
			const state = this.#getMediaState();
			this.#ipcRenderer.send('media-privacy:state', { requestId, state });
		});

		console.debug('[MEDIA_PRIVACY] IPC listeners registered');
	}

	#disableMedia() {
		if (this.#isMediaBlocked) {
			console.debug('[MEDIA_PRIVACY] Media already disabled');
			return;
		}

		this.#isMediaBlocked = true;
		this.#stoppedTracks = [];

		const streamsToStop = this.#getAllMediaStreams();

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
		this.#notifyStateChange();
	}

	#getAllMediaStreams() {
		const streams = new Set(this.#trackedStreams);

		const videoElements = document.querySelectorAll('video');
		for (const video of videoElements) {
			if (video.srcObject instanceof MediaStream) {
				streams.add(video.srcObject);
			}
		}

		return streams;
	}

	#enableMedia() {
		if (!this.#isMediaBlocked) {
			console.debug('[MEDIA_PRIVACY] Media already enabled');
			return;
		}

		this.#isMediaBlocked = false;
		console.info('[MEDIA_PRIVACY] Media enabled - getUserMedia requests now allowed');
		console.info('[MEDIA_PRIVACY] Note: Previously stopped tracks must be restarted by Teams (toggle camera/mic in UI)');

		this.#trackedStreams.clear();
		this.#stoppedTracks = [];
		this.#notifyStateChange();
	}

	#getMediaState() {
		const activeTracks = [];
		const processedTracks = new Set();
		const allStreams = this.#getAllMediaStreams();

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

	#notifyStateChange() {
		const state = this.#getMediaState();
		this.#ipcRenderer.send('media-privacy:state-changed', state);
	}
}

module.exports = new MediaPrivacy();

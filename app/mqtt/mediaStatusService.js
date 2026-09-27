const { app, ipcMain } = require('electron');
const { getMediaTopics } = require('./mediaTopics');

/**
 * MQTT Media Status Service
 *
 * Bridges IPC events from renderer process (WebRTC monitoring, call state)
 * to MQTT broker for home automation integration.
 *
 * Publishes to topics:
 * - {topicPrefix}/camera - Camera on/off state (not yet wired)
 * - {topicPrefix}/microphone - Microphone state: 'speaking' | 'silent' | 'muted' | 'off'
 * - {topicPrefix}/in-call - Active call state
 * - {topicPrefix}/incoming-call - Whether a call is ringing
 * - {topicPrefix}/incoming-call/caller - JSON details of the ringing call's
 *   caller (#3019), cleared when it stops ringing
 * - {topicPrefix}/screen-sharing - Screen sharing active state
 * - {topicPrefix}/meeting-started - Scheduled-meeting-start pulse (#2587):
 *   'true' on detection, back to 'false' on whichever comes first: joining
 *   the call, or mqtt.meetingStartDetection.resetSeconds elapsing
 */
class MQTTMediaStatusService {
	#mqttClient;
	#topicPrefix;
	#clientId;
	#mediaTopics;
	#lastMicrophoneState = null;
	#lastMicrophoneControlState = null;
	#meetingStartedResetMs;
	#meetingStartedResetTimer = null;

	constructor(mqttClient, config) {
		this.#mqttClient = mqttClient;
		this.#topicPrefix = config.mqtt.topicPrefix;
		this.#clientId = config.mqtt.clientId;
		this.#mediaTopics = getMediaTopics(config.mqtt);
		this.#meetingStartedResetMs =
			(config.mqtt.meetingStartDetection?.resetSeconds ?? 10) * 1000;
	}

	initialize() {
		// Publish MQTT status when camera state changes
		ipcMain.on('camera-state-changed', this.#handleCameraChanged.bind(this));
		// Publish MQTT status when microphone state changes
		ipcMain.on('microphone-state-changed', this.#handleMicrophoneChanged.bind(this));

		// Publish an MQTT pulse when the renderer detects a scheduled-meeting-start toast (#2587)
		ipcMain.on('meeting-started', this.#handleMeetingStarted.bind(this));

		// Publish MQTT status when screen sharing starts
		ipcMain.on('screen-sharing-started', () => this.#handleScreenSharingChanged(true));
		// Publish MQTT status when screen sharing stops
		ipcMain.on('screen-sharing-stopped', () => this.#handleScreenSharingChanged(false));

		app.on('teams-call-connected', this.#handleCallConnected.bind(this));
		app.on('teams-call-disconnected', this.#handleCallDisconnected.bind(this));

		// Publish MQTT status when an incoming call starts or ends
		app.on('teams-incoming-call-started', this.#handleIncomingCallStarted.bind(this));
		app.on('teams-incoming-call-ended', this.#handleIncomingCallEnded.bind(this));

		console.info('[MQTTMediaStatusService] Initialized');
	}

	async #publishBoolean(subtopic, value, label) {
		try {
			const topic = `${this.#topicPrefix}/${subtopic}`;
			await this.#mqttClient.publish(topic, value, { retain: true });
			console.debug(`[MQTTMediaStatusService] ${label}, published to`, topic);
		} catch (error) {
			console.error(`[MQTTMediaStatusService] Failed to publish ${subtopic}:`, { message: error.message });
		}
	}

	async #handleCallConnected() {
		await this.#publishBoolean(this.#mediaTopics.inCall, 'true', 'Call connected');
		// Joining the meeting is the answer to "has it started?", so close the
		// pulse early rather than leaving it true alongside in-call (#2587).
		await this.#clearMeetingStarted('Meeting joined');
	}

	// The caller goes out before 'true' so that anything reacting to the ring
	// finds it already there. A call-queue toast in conference mode arrives
	// twice while ringing, the second with the name and queue filled in, and
	// each one replaces the caller published before it.
	async #handleIncomingCallStarted(details) {
		await this.#publishIncomingCallCaller(details);
		await this.#publishBoolean(this.#mediaTopics.incomingCall, 'true', 'Incoming call started');
	}

	async #handleIncomingCallEnded() {
		await this.#publishBoolean(this.#mediaTopics.incomingCall, 'false', 'Incoming call ended');
		await this.#clearIncomingCallCaller();
	}

	/**
	 * Only the known fields are copied, so nothing else the renderer sends
	 * (the caller's picture, say) can reach the broker. The timestamp (when
	 * this was published) and clientId are carried as on the status topic.
	 */
	async #publishIncomingCallCaller(details) {
		const caller = {};
		for (const key of ['scenario', 'number', 'name', 'queue', 'contact', 'callId']) {
			if (details?.[key] !== undefined && details[key] !== null) {
				caller[key] = details[key];
			}
		}
		caller.timestamp = new Date().toISOString();
		caller.clientId = this.#clientId;
		await this.#publishRetained(this.#mediaTopics.incomingCallCaller, JSON.stringify(caller), 'Incoming call caller');
	}

	// An empty retained message deletes the retained one, so a caller's name
	// and number do not stay on the broker after the call stops ringing.
	async #clearIncomingCallCaller() {
		await this.#publishRetained(this.#mediaTopics.incomingCallCaller, '', 'Incoming call caller cleared');
	}

	async #publishRetained(subtopic, payload, label) {
		try {
			const topic = `${this.#topicPrefix}/${subtopic}`;
			await this.#mqttClient.publish(topic, payload, { retain: true });
			console.debug(`[MQTTMediaStatusService] ${label}, published to`, topic);
		} catch (error) {
			console.error(`[MQTTMediaStatusService] Failed to publish ${subtopic}:`, { message: error.message });
		}
	}

	/**
	 * Drop the meeting-started flag and cancel any pending reset. Safe to call
	 * when the flag is already down: the timer is only armed while it is up.
	 */
	async #clearMeetingStarted(label) {
		if (!this.#meetingStartedResetTimer) return;
		clearTimeout(this.#meetingStartedResetTimer);
		this.#meetingStartedResetTimer = null;
		await this.#publishBoolean(this.#mediaTopics.meetingStarted, 'false', label);
	}

	/**
	 * Teams gives us no "meeting ended" signal, so the topic cannot latch
	 * indefinitely. It goes 'true' on detection and back to 'false' on
	 * whichever comes first: joining the call, or the configured reset delay.
	 * A new detection during the pulse restarts the timer.
	 */
	async #handleMeetingStarted() {
		if (this.#meetingStartedResetTimer) {
			clearTimeout(this.#meetingStartedResetTimer);
		}

		// Arm the reset before awaiting the publish, not after: a join landing
		// during that await would otherwise find no timer to cancel and leave
		// the retained topic stuck at 'true' with nothing to bring it down.
		this.#meetingStartedResetTimer = setTimeout(() => {
			this.#meetingStartedResetTimer = null;
			// #publishBoolean handles its own errors
			this.#publishBoolean(this.#mediaTopics.meetingStarted, 'false', 'Meeting-started pulse reset');
		}, this.#meetingStartedResetMs);

		await this.#publishBoolean(this.#mediaTopics.meetingStarted, 'true', 'Meeting start detected');
	}

	async #handleCallDisconnected() {
		await this.#publishBoolean(this.#mediaTopics.inCall, 'false', 'Call disconnected');
		await this.#publishMicrophoneState('off');
		await this.#publishMicrophoneControlState('off');
	}

	async #handleCameraChanged(event, enabled) {
		await this.#publishBoolean(this.#mediaTopics.camera, String(enabled), `Camera state changed to ${enabled}`);
	}

	async #handleMicrophoneChanged(event, state) {
		await this.#publishMicrophoneState(state);

		const controlState = this.#toMicrophoneControlState(state);
		await this.#publishMicrophoneControlState(controlState);
	}

	#toMicrophoneControlState(state) {
		if (state === 'muted') return 'muted';
		if (state === 'speaking' || state === 'silent') return 'unmuted';
		if (state === 'off') return 'off';
		return 'unknown';
	}

	async #publishMicrophoneState(state) {
		if (this.#lastMicrophoneState === state) {
			return;
		}

		this.#lastMicrophoneState = state;
		const topic = `${this.#topicPrefix}/${this.#mediaTopics.microphone}`;
		await this.#mqttClient.publish(topic, state, { retain: true });
		console.debug('[MQTTMediaStatusService] Microphone state changed to', state, 'published to', topic);
	}

	async #publishMicrophoneControlState(controlState) {
		if (this.#lastMicrophoneControlState === controlState) {
			return;
		}

		this.#lastMicrophoneControlState = controlState;
		const topic = `${this.#topicPrefix}/${this.#mediaTopics.microphoneControl}`;
		await this.#mqttClient.publish(topic, controlState, { retain: true });
		console.debug('[MQTTMediaStatusService] Microphone control state changed to', controlState, 'published to', topic);
		app.emit('teams-microphone-control-changed', controlState);
	}

	async #handleScreenSharingChanged(isSharing) {
		const label = isSharing ? 'Screen sharing started' : 'Screen sharing stopped';
		await this.#publishBoolean(this.#mediaTopics.screenSharing, String(isSharing), label);
	}
}

module.exports = MQTTMediaStatusService;

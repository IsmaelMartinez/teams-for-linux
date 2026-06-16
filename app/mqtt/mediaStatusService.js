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
 * - {topicPrefix}/screen-sharing - Screen sharing active state
 */
class MQTTMediaStatusService {
	#mqttClient;
	#topicPrefix;
	#mediaTopics;
	#lastMicrophoneState = null;
	#lastMicrophoneControlState = null;

	constructor(mqttClient, config) {
		this.#mqttClient = mqttClient;
		this.#topicPrefix = config.mqtt.topicPrefix;
		this.#mediaTopics = getMediaTopics(config.mqtt);
	}

	initialize() {
		// Publish MQTT status when camera state changes
		ipcMain.on('camera-state-changed', this.#handleCameraChanged.bind(this));
		// Publish MQTT status when microphone state changes
		ipcMain.on('microphone-state-changed', this.#handleMicrophoneChanged.bind(this));

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
	}

	async #handleIncomingCallStarted() {
		await this.#publishBoolean(this.#mediaTopics.incomingCall, 'true', 'Incoming call started');
	}

	async #handleIncomingCallEnded() {
		await this.#publishBoolean(this.#mediaTopics.incomingCall, 'false', 'Incoming call ended');
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

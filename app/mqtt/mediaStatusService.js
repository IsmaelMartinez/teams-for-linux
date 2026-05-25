const { app, ipcMain } = require('electron');

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
 * - {topicPrefix}/incoming-call - Ringing/invite state (before accept)
 * - {topicPrefix}/screen-sharing - Screen sharing active state
 */
class MQTTMediaStatusService {
	#mqttClient;
	#topicPrefix;

	constructor(mqttClient, config) {
		this.#mqttClient = mqttClient;
		this.#topicPrefix = config.mqtt.topicPrefix;
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
		await this.#publishBoolean('in-call', 'true', 'Call connected');
	}

	async #handleCallDisconnected() {
		await this.#publishBoolean('in-call', 'false', 'Call disconnected');
	}

	async #handleCameraChanged(event, enabled) {
		await this.#publishBoolean('camera', String(enabled), `Camera state changed to ${enabled}`);
	}

	async #handleMicrophoneChanged(event, state) {
		await this.#publishBoolean('microphone', state, `Microphone state changed to ${state}`);
	}

	async #handleScreenSharingChanged(isSharing) {
		const label = isSharing ? 'Screen sharing started' : 'Screen sharing stopped';
		await this.#publishBoolean('screen-sharing', String(isSharing), label);
	}

	async #handleIncomingCallStarted() {
		await this.#publishBoolean('incoming-call', 'true', 'Incoming call started');
	}

	async #handleIncomingCallEnded() {
		await this.#publishBoolean('incoming-call', 'false', 'Incoming call ended');
	}
}

module.exports = MQTTMediaStatusService;

const { app, ipcMain } = require('electron');

/**
 * MQTT Media Status Service
 *
 * Bridges IPC events from renderer process (WebRTC monitoring, call state)
 * to MQTT broker for home automation integration.
 *
 * Publishes to topics:
 * - {topicPrefix}/camera - Camera on/off state
 * - {topicPrefix}/microphone - Microphone on/off state
 * - {topicPrefix}/in-call - Active call state
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
		ipcMain.on('screen-sharing-started', this.#handleScreenSharingStarted.bind(this));
		// Publish MQTT status when screen sharing stops
		ipcMain.on('screen-sharing-stopped', this.#handleScreenSharingStopped.bind(this));

		app.on('teams-call-connected', this.#handleCallConnected.bind(this));
		app.on('teams-call-disconnected', this.#handleCallDisconnected.bind(this));

		console.info('[MQTTMediaStatusService] Initialized');
	}

	async #handleCallConnected() {
		const topic = `${this.#topicPrefix}/in-call`;
		await this.#mqttClient.publish(topic, 'true', { retain: true });
		console.debug('[MQTTMediaStatusService] Call connected, published to', topic);
	}

	async #handleCallDisconnected() {
		const topic = `${this.#topicPrefix}/in-call`;
		await this.#mqttClient.publish(topic, 'false', { retain: true });
		console.debug('[MQTTMediaStatusService] Call disconnected, published to', topic);
	}

	async #handleCameraChanged(event, enabled) {
		const topic = `${this.#topicPrefix}/camera`;
		await this.#mqttClient.publish(topic, String(enabled), { retain: true });
		console.debug('[MQTTMediaStatusService] Camera state changed to', enabled, 'published to', topic);
	}

	async #handleMicrophoneChanged(event, enabled) {
		const topic = `${this.#topicPrefix}/microphone`;
		await this.#mqttClient.publish(topic, String(enabled), { retain: true });
		console.debug('[MQTTMediaStatusService] Microphone state changed to', enabled, 'published to', topic);
	}

	async #handleScreenSharingStarted() {
		const topic = `${this.#topicPrefix}/screen-sharing`;
		await this.#mqttClient.publish(topic, 'true', { retain: true });
		console.debug('[MQTTMediaStatusService] Screen sharing started, published to', topic);
	}

	async #handleScreenSharingStopped() {
		const topic = `${this.#topicPrefix}/screen-sharing`;
		await this.#mqttClient.publish(topic, 'false', { retain: true });
		console.debug('[MQTTMediaStatusService] Screen sharing stopped, published to', topic);
	}
}

module.exports = MQTTMediaStatusService;

const { ipcMain } = require('electron');

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
 */
class MQTTMediaStatusService {
	#mqttClient;
	#topicPrefix;

	constructor(mqttClient, config) {
		this.#mqttClient = mqttClient;
		this.#topicPrefix = config.mqtt.topicPrefix;
	}

	initialize() {
		ipcMain.on('call-connected', this.#handleCallConnected.bind(this));
		ipcMain.on('call-disconnected', this.#handleCallDisconnected.bind(this));
		ipcMain.on('camera-state-changed', this.#handleCameraChanged.bind(this));
		ipcMain.on('microphone-state-changed', this.#handleMicrophoneChanged.bind(this));

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
}

module.exports = MQTTMediaStatusService;

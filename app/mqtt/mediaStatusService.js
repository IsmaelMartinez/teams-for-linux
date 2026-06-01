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
		this.#mediaTopics = {
			inCall: config.mqtt.mediaTopics?.inCall || 'in-call',
			camera: config.mqtt.mediaTopics?.camera || 'camera',
			microphone: config.mqtt.mediaTopics?.microphone || 'microphone',
			microphoneControl: config.mqtt.mediaTopics?.microphoneControl || 'microphone/control',
			screenSharing: config.mqtt.mediaTopics?.screenSharing || 'screen-sharing',
		};
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

		console.info('[MQTTMediaStatusService] Initialized');
	}

	async #handleCallConnected() {
		const topic = `${this.#topicPrefix}/${this.#mediaTopics.inCall}`;
		await this.#mqttClient.publish(topic, 'true', { retain: true });
		console.debug('[MQTTMediaStatusService] Call connected, published to', topic);
	}

	async #handleCallDisconnected() {
		const topic = `${this.#topicPrefix}/${this.#mediaTopics.inCall}`;
		await this.#mqttClient.publish(topic, 'false', { retain: true });
		await this.#publishMicrophoneState('off');
		await this.#publishMicrophoneControlState('off');
		console.debug('[MQTTMediaStatusService] Call disconnected, published to', topic);
	}

	async #handleCameraChanged(event, enabled) {
		const topic = `${this.#topicPrefix}/${this.#mediaTopics.camera}`;
		await this.#mqttClient.publish(topic, String(enabled), { retain: true });
		console.debug('[MQTTMediaStatusService] Camera state changed to', enabled, 'published to', topic);
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
		const topic = `${this.#topicPrefix}/${this.#mediaTopics.screenSharing}`;
		await this.#mqttClient.publish(topic, String(isSharing), { retain: true });
		const state = isSharing ? 'started' : 'stopped';
		console.debug('[MQTTMediaStatusService] Screen sharing', state, 'published to', topic);
	}
}

module.exports = MQTTMediaStatusService;

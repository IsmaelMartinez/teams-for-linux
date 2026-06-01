/**
 * Home Assistant MQTT Auto-Discovery
 *
 * Publishes MQTT discovery configurations for Home Assistant, automatically
 * creating entities for Teams status, media states, and controls.
 *
 * Entities created:
 * - sensor:        Teams presence status (plain text), Microphone state
 * - binary_sensor: In-Call, Incoming Call, Screen Sharing, Camera
 * - button:        Toggle Mute, Toggle Video, Toggle Hand Raise (requires commandTopic)
 *
 * Buttons use payload_press with the pre-built JSON command.
 *
 * Discovery is published on every broker connect/reconnect so entities survive
 * broker restarts. Availability is controlled via {topicPrefix}/connected topic.
 */
class HomeAssistantDiscovery {
	#mqttClient;
	#mqttConfig;
	#topicPrefix;
	#discoveryPrefix;
	#deviceId;
	#deviceName;
	#commandTopic;
	#mediaTopics;

	constructor(mqttClient, config) {
		this.#mqttClient = mqttClient;
		this.#mqttConfig = config.mqtt;
		this.#topicPrefix = config.mqtt.topicPrefix;
		this.#discoveryPrefix = config.mqtt.homeAssistant?.discoveryPrefix || 'homeassistant';
		this.#deviceId = config.mqtt.clientId;
		this.#deviceName = config.mqtt.homeAssistant?.deviceName || 'Teams for Linux';
		this.#mediaTopics = {
			inCall: config.mqtt.mediaTopics?.inCall || 'in-call',
			camera: config.mqtt.mediaTopics?.camera || 'camera',
			microphone: config.mqtt.mediaTopics?.microphone || 'microphone',
			incomingCall: config.mqtt.mediaTopics?.incomingCall || 'incoming-call',
			screenSharing: config.mqtt.mediaTopics?.screenSharing || 'screen-sharing',
		};
		this.#commandTopic = config.mqtt.commandTopic
			? `${config.mqtt.topicPrefix}/${config.mqtt.commandTopic}`
			: null;
	}

	initialize() {
		this.#mqttClient.on('connected', () => this.publishDiscovery());

		// Handle race: if already connected when initialized, publish immediately
		if (this.#mqttClient.isConnected) {
			this.publishDiscovery();
		}

		console.info('[HomeAssistantDiscovery] Initialized');
	}

	#getDevice() {
		return {
			identifiers: [this.#deviceId],
			name: this.#deviceName,
			model: 'Teams for Linux',
			manufacturer: 'teams-for-linux',
		};
	}

	#getAvailability() {
		return {
			topic: `${this.#topicPrefix}/connected`,
			payload_available: 'true',
			payload_not_available: 'false',
		};
	}

	#buildSensorConfig() {
		return {
			name: 'Teams Status',
			unique_id: `${this.#deviceId}_status`,
			state_topic: `${this.#topicPrefix}/${this.#mqttConfig.statusTopic}`,
			value_template: '{{ value_json.status }}',
			icon: 'mdi:microsoft-teams',
			availability: this.#getAvailability(),
			device: this.#getDevice(),
		};
	}

	#buildBinarySensorConfig(name, objectId, stateTopic, icon) {
		return {
			name,
			unique_id: `${this.#deviceId}_${objectId}`,
			state_topic: `${this.#topicPrefix}/${stateTopic}`,
			payload_on: 'true',
			payload_off: 'false',
			icon,
			availability: this.#getAvailability(),
			device: this.#getDevice(),
		};
	}

	#buildMicrophoneSensorConfig() {
		return {
			name: 'Teams Microphone',
			unique_id: `${this.#deviceId}_microphone`,
			state_topic: `${this.#topicPrefix}/${this.#mediaTopics.microphone}`,
			icon: 'mdi:microphone',
			availability: this.#getAvailability(),
			device: this.#getDevice(),
		};
	}

	#buildButtonConfig(name, objectId, action, icon) {
		if (!this.#commandTopic) return null;
		return {
			name,
			unique_id: `${this.#deviceId}_${objectId}`,
			command_topic: this.#commandTopic,
			payload_press: JSON.stringify({action}),
			icon,
			availability: this.#getAvailability(),
			device: this.#getDevice(),
		};
	}

	async publishDiscovery() {
		const entities = [
			{component: 'sensor', objectId: 'status', config: this.#buildSensorConfig()},
			{component: 'sensor', objectId: 'microphone', config: this.#buildMicrophoneSensorConfig()},
			{
				component: 'binary_sensor',
				objectId: 'in_call',
				config: this.#buildBinarySensorConfig('Teams In Call', 'in_call', this.#mediaTopics.inCall, 'mdi:phone-in-talk')
			},
			{
				component: 'binary_sensor',
				objectId: 'screen_sharing',
				config: this.#buildBinarySensorConfig('Teams Screen Sharing', 'screen_sharing', this.#mediaTopics.screenSharing, 'mdi:monitor-share')
			},
			{
				component: 'binary_sensor',
				objectId: 'camera',
				config: this.#buildBinarySensorConfig('Teams Camera', 'camera', this.#mediaTopics.camera, 'mdi:camera')
			},
			{
				component: 'binary_sensor',
				objectId: 'incoming_call',
				config: this.#buildBinarySensorConfig('Teams Incoming Call', 'incoming_call', this.#mediaTopics.incomingCall, 'mdi:phone-ring')
			},
			{
				component: 'button',
				objectId: 'toggle_mute',
				config: this.#buildButtonConfig('Teams Toggle Mute', 'toggle_mute', 'toggle-mute', 'mdi:microphone')
			},
			{
				component: 'button',
				objectId: 'toggle_video',
				config: this.#buildButtonConfig('Teams Toggle Video', 'toggle_video', 'toggle-video', 'mdi:video')
			},
			{
				component: 'button',
				objectId: 'toggle_hand_raise',
				config: this.#buildButtonConfig('Teams Toggle Hand Raise', 'toggle_hand_raise', 'toggle-hand-raise', 'mdi:hand-back-left')
			},
		];

		for (const {component, objectId, config} of entities) {
			if (!config) continue;
			const topic = `${this.#discoveryPrefix}/${component}/${this.#deviceId}/${objectId}/config`;
			await this.#mqttClient.publish(topic, config, {retain: true});
		}

		console.info('[HomeAssistantDiscovery] Published discovery configurations');
	}
}

module.exports = HomeAssistantDiscovery;

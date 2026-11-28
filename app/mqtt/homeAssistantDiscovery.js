/**
 * Home Assistant MQTT Auto-Discovery
 *
 * Publishes MQTT discovery configurations for Home Assistant, automatically
 * creating entities for Teams status, media states, and controls.
 *
 * Entities created:
 * - sensor:        Teams presence status (plain text), Microphone state
 * - binary_sensor: In-Call, Incoming Call, Meeting Started, Screen Sharing, Camera
 * - button:        Leave, Toggle Mute, Toggle Video, Toggle Hand Raise (requires commandTopic)
 *
 * Buttons use payload_press with the pre-built JSON command.
 *
 * Discovery is published on every broker connect/reconnect so entities survive
 * broker restarts. Availability is controlled via {topicPrefix}/connected topic.
 */
const { getMediaTopics } = require('./mediaTopics');
const { mqtt: { availability } } = require('../control/contract');

/**
 * The discovery entities for an mqtt config, in publication order. Pure: it
 * touches no broker, so the generated automation reference can list them too.
 * Buttons are left out when no command topic is configured.
 *
 * @param {object} mqttConfig - The config.mqtt object
 * @returns {Array<{component: string, objectId: string, topic: string, config: object}>}
 */
function buildDiscoveryEntities(mqttConfig) {
	const topicPrefix = mqttConfig.topicPrefix;
	const discoveryPrefix = mqttConfig.homeAssistant?.discoveryPrefix || 'homeassistant';
	const deviceId = mqttConfig.clientId;
	const deviceName = mqttConfig.homeAssistant?.deviceName || 'Teams for Linux';
	const mediaTopics = getMediaTopics(mqttConfig);
	const commandTopic = mqttConfig.commandTopic
		? `${topicPrefix}/${mqttConfig.commandTopic}`
		: null;

	const getDevice = () => ({
		identifiers: [deviceId],
		name: deviceName,
		model: 'Teams for Linux',
		manufacturer: 'teams-for-linux',
	});

	const getAvailability = () => ({
		topic: `${topicPrefix}/${availability.subtopic}`,
		payload_available: availability.online,
		payload_not_available: availability.offline,
	});

	const buildSensorConfig = () => ({
		name: 'Teams Status',
		unique_id: `${deviceId}_status`,
		state_topic: `${topicPrefix}/${mqttConfig.statusTopic}`,
		value_template: '{{ value_json.status }}',
		icon: 'mdi:microsoft-teams',
		availability: getAvailability(),
		device: getDevice(),
	});

	const buildBinarySensorConfig = (name, objectId, stateTopic, icon) => ({
		name,
		unique_id: `${deviceId}_${objectId}`,
		state_topic: `${topicPrefix}/${stateTopic}`,
		payload_on: 'true',
		payload_off: 'false',
		icon,
		availability: getAvailability(),
		device: getDevice(),
	});

	const buildMicrophoneSensorConfig = () => ({
		name: 'Teams Microphone',
		unique_id: `${deviceId}_microphone`,
		state_topic: `${topicPrefix}/${mediaTopics.microphone}`,
		icon: 'mdi:microphone',
		availability: getAvailability(),
		device: getDevice(),
	});

	const buildButtonConfig = (name, objectId, action, icon) => {
		if (!commandTopic) return null;
		return {
			name,
			unique_id: `${deviceId}_${objectId}`,
			command_topic: commandTopic,
			payload_press: JSON.stringify({action}),
			icon,
			availability: getAvailability(),
			device: getDevice(),
		};
	};

	const entities = [
		{component: 'sensor', objectId: 'status', config: buildSensorConfig()},
		{component: 'sensor', objectId: 'microphone', config: buildMicrophoneSensorConfig()},
		{
			component: 'binary_sensor',
			objectId: 'in_call',
			config: buildBinarySensorConfig('Teams In Call', 'in_call', mediaTopics.inCall, 'mdi:phone-in-talk')
		},
		{
			component: 'binary_sensor',
			objectId: 'screen_sharing',
			config: buildBinarySensorConfig('Teams Screen Sharing', 'screen_sharing', mediaTopics.screenSharing, 'mdi:monitor-share')
		},
		{
			component: 'binary_sensor',
			objectId: 'camera',
			config: buildBinarySensorConfig('Teams Camera', 'camera', mediaTopics.camera, 'mdi:camera')
		},
		{
			component: 'binary_sensor',
			objectId: 'incoming_call',
			config: buildBinarySensorConfig('Teams Incoming Call', 'incoming_call', mediaTopics.incomingCall, 'mdi:phone-ring')
		},
		{
			component: 'binary_sensor',
			objectId: 'meeting_started',
			config: buildBinarySensorConfig('Teams Meeting Started', 'meeting_started', mediaTopics.meetingStarted, 'mdi:calendar-clock')
		},
		{
			component: 'button',
			objectId: 'toggle_mute',
			config: buildButtonConfig('Teams Toggle Mute', 'toggle_mute', 'toggle-mute', 'mdi:microphone')
		},
		{
			component: 'button',
			objectId: 'toggle_video',
			config: buildButtonConfig('Teams Toggle Video', 'toggle_video', 'toggle-video', 'mdi:video')
		},
		{
			component: 'button',
			objectId: 'toggle_hand_raise',
			config: buildButtonConfig('Teams Toggle Hand Raise', 'toggle_hand_raise', 'toggle-hand-raise', 'mdi:hand-back-left')
		},
		{
			component: 'button',
			objectId: 'leave',
			config: buildButtonConfig('Teams Leave Call', 'leave', 'leave', 'mdi:phone-hangup')
		},
	];

	return entities
		.filter(({config}) => config)
		.map(({component, objectId, config}) => ({
			component,
			objectId,
			topic: `${discoveryPrefix}/${component}/${deviceId}/${objectId}/config`,
			config,
		}));
}

class HomeAssistantDiscovery {
	#mqttClient;
	#mqttConfig;

	constructor(mqttClient, config) {
		this.#mqttClient = mqttClient;
		this.#mqttConfig = config.mqtt;
	}

	initialize() {
		this.#mqttClient.on('connected', () => this.publishDiscovery());

		// Handle race: if already connected when initialized, publish immediately
		if (this.#mqttClient.isConnected) {
			this.publishDiscovery();
		}

		console.info('[HomeAssistantDiscovery] Initialized');
	}

	async publishDiscovery() {
		for (const {topic, config} of buildDiscoveryEntities(this.#mqttConfig)) {
			await this.#mqttClient.publish(topic, config, {retain: true});
		}

		console.info('[HomeAssistantDiscovery] Published discovery configurations');
	}
}

module.exports = HomeAssistantDiscovery;
module.exports.buildDiscoveryEntities = buildDiscoveryEntities;

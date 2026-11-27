const mqtt = require('mqtt');
const { EventEmitter } = require('node:events');
const { shared, mqtt: mqttContract } = require('../control/contract');

const { availability, qos: DEFAULT_QOS } = mqttContract;

// What an error may contribute to a log line. Its message is left out: for a
// connection failure it carries the broker's host name, and topics and broker
// URLs must stay out of the logs (ADR-013).
function errorCode(error) {
	return { code: error?.code ?? error?.name ?? 'unknown' };
}

/**
 * MQTT Client for Teams Status Publishing and Command Reception
 * Manages connection, publishing of Teams status updates, and receiving action commands from an MQTT broker
 */
class MQTTClient extends EventEmitter {
	constructor(config) {
		super();
		this.config = config.mqtt;
		this.client = null;
		this.isConnected = false;
		this.lastPublishedStatus = null;
		this.statusMap = Object.fromEntries(shared.presence.observed.map(([code, name]) => [String(code), name]));

		// Command handling configuration: the contract's actions that send a
		// keyboard shortcut, and those (get-calendar) that do not.
		const shortcutFor = (command) => shared.shortcuts[shared.commands[command].shortcut];
		this.actionShortcutMap = Object.fromEntries(
			mqttContract.actions
				.filter(({ command }) => shared.commands[command].effect === 'shortcut')
				.map(({ action, command }) => [action, shortcutFor(command)])
		);

		this.nonShortcutActions = mqttContract.actions
			.filter(({ command }) => shared.commands[command].effect !== 'shortcut')
			.map(({ action }) => action);
	}

	get allowedActions() {
		return [...Object.keys(this.actionShortcutMap), ...this.nonShortcutActions];
	}

	async initialize() {
		if (!this.config.enabled || !this.config.brokerUrl) {
			console.debug('[MQTT] Disabled or no broker URL configured');
			return;
		}

		try {
			const connectionTopic = `${this.config.topicPrefix}/${availability.subtopic}`;

			const options = {
				clientId: this.config.clientId,
				will: {
					topic: connectionTopic,
					payload: availability.offline,
					qos: DEFAULT_QOS,
					retain: availability.retained
				}
			};

			if (this.config.username) {
				options.username = this.config.username;
				options.password = this.config.password;
			}

			console.info('[MQTT] Connecting to broker');

			this.client = mqtt.connect(this.config.brokerUrl, options);

			this.client.on('connect', () => {
				this.isConnected = true;
				console.info('[MQTT] Successfully connected to broker');

				this.client.publish(connectionTopic, availability.online, { retain: availability.retained });

				// Subscribe to command topic for receiving action commands (if configured)
				if (this.config.commandTopic) {
					const commandTopic = `${this.config.topicPrefix}/${this.config.commandTopic}`;
					this.client.subscribe(commandTopic, (err) => {
						if (err) {
							console.error('[MQTT] Failed to subscribe to the command topic:', errorCode(err));
						} else {
							console.info('[MQTT] Subscribed to the command topic');
						}
					});
				} else {
					console.debug('[MQTT] Command topic not configured, skipping command subscription');
				}

				this.emit('connected');
			});

			this.client.on('error', (error) => {
				console.error('[MQTT] Connection error:', errorCode(error));
				this.isConnected = false;
			});

			this.client.on('close', () => {
				this.isConnected = false;
				console.debug('[MQTT] Connection closed');
			});

			this.client.on('reconnect', () => {
				console.debug('[MQTT] Reconnecting to broker');
			});

			this.client.on('message', (topic, message) => {
				if (this.config.commandTopic) {
					const commandTopic = `${this.config.topicPrefix}/${this.config.commandTopic}`;
					if (topic === commandTopic) {
						this.handleCommand(message.toString());
					}
				}
			});

		} catch (error) {
			console.error('[MQTT] Failed to initialize client:', errorCode(error));
		}
	}

	/**
	 * @param {string} topic - Full MQTT topic path
	 * @param {string|object} payload - Payload to publish (will be converted to string)
	 * @param {object} options - MQTT publish options
	 * @param {boolean} options.retain - Whether to retain the message (default: true)
	 * @param {number} options.qos - Quality of Service level (default: 0)
	 *
	 * The topic and payload are never logged, whatever the message.
	 */
	async publish(topic, payload, options = {}) {
		if (!this.isConnected || !this.client) {
			console.debug('[MQTT] Not connected, skipping publish');
			return;
		}

		const payloadString = typeof payload === 'object'
			? JSON.stringify(payload)
			: String(payload);

		try {
			await this.client.publish(topic, payloadString, {
				retain: options.retain ?? true,
				qos: options.qos ?? DEFAULT_QOS
			});

			console.debug('[MQTT] Published a message');
		} catch (error) {
			console.error('[MQTT] Failed to publish a message:', errorCode(error));
		}
	}

	async publishStatus(status) {
		if (!this.isConnected || !this.client) {
			console.debug('[MQTT] Not connected, skipping status publish');
			return;
		}

		const statusString = this.statusMap[String(status)] || 'unknown';
		const topic = `${this.config.topicPrefix}/${this.config.statusTopic}`;

		// Only publish if status has changed
		if (this.lastPublishedStatus === statusString) {
			return;
		}

		const payload = JSON.stringify({
			status: statusString,
			statusCode: Number(status),
			timestamp: new Date().toISOString(),
			clientId: this.config.clientId
		});

		try {
			await this.client.publish(topic, payload, { retain: true });

			this.lastPublishedStatus = statusString;
			console.debug(`[MQTT] Published status: ${statusString}`);

		} catch (error) {
			console.error('[MQTT] Failed to publish status:', errorCode(error));
		}
	}

	/**
	 * Publish data to a custom MQTT topic (with auto-prefix)
	 * @param {string} topic - Topic name (without prefix)
	 * @param {object|string} payload - Data to publish (will be stringified if object)
	 * @param {object} options - MQTT publish options (optional)
	 */
	async publishToTopic(topic, payload, options = {}) {
		if (!this.isConnected || !this.client) {
			console.debug('[MQTT] Not connected, skipping publish');
			return;
		}

		const fullTopic = `${this.config.topicPrefix}/${topic}`;
		const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

		try {
			await this.client.publish(fullTopic, message, options);
			console.debug('[MQTT] Published to a custom topic');
		} catch (error) {
			console.error('[MQTT] Failed to publish:', errorCode(error));
		}
	}

	/**
	 * Handle incoming MQTT command
	 * Validates command messages and emits 'command' event for execution
	 *
	 * @param {string} messageString - Raw message string from MQTT
	 *
	 * Security features:
	 * - JSON validation
	 * - Action whitelist (only allowed actions are processed)
	 *
	 * Emits 'command' event with { action, shortcut } when valid command received
	 */
	handleCommand(messageString) {
		try {
			const command = JSON.parse(messageString);

			if (!command || typeof command !== 'object') {
				console.warn('[MQTT] Invalid command: not an object');
				return;
			}

			if (!command.action || typeof command.action !== 'string') {
				console.warn('[MQTT] Invalid command: missing or invalid action');
				return;
			}

			if (!this.allowedActions.includes(command.action)) {
				// The action is whatever the publisher sent, so it is not echoed.
				console.warn('[MQTT] Invalid command: action not in whitelist');
				return;
			}

			console.info(`[MQTT] Received valid command: ${command.action}`);

			const shortcut = this.actionShortcutMap[command.action];
			this.emit('command', { ...command, shortcut });

		} catch (error) {
			console.error('[MQTT] Failed to handle command:', errorCode(error));
		}
	}

	async disconnect() {
		if (this.client) {
			console.debug('[MQTT] Disconnecting from broker');
			try {
				const connectionTopic = `${this.config.topicPrefix}/${availability.subtopic}`;
				await this.client.publish(connectionTopic, availability.offline, { retain: availability.retained });
				await this.client.end(false);
			} catch (error) {
				console.error('[MQTT] Error disconnecting:', errorCode(error));
			}
			this.client = null;
			this.isConnected = false;
		}
	}
}

module.exports = { MQTTClient };

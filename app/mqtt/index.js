const mqtt = require('mqtt');
const { EventEmitter } = require('node:events');

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
		this.statusMap = {
			'-1': 'unknown',
			'1': 'available',
			'2': 'busy',
			'3': 'do_not_disturb',
			'4': 'away',
			'5': 'be_right_back'
		};

		// Command handling configuration
		this.actionShortcutMap = {
			'toggle-mute': 'Ctrl+Shift+M',
			'toggle-video': 'Ctrl+Shift+O',
			'toggle-hand-raise': 'Ctrl+Shift+K'
		};
	}

	/**
	 * Get list of allowed actions
	 * @returns {string[]} Array of allowed action names
	 */
	get allowedActions() {
		return Object.keys(this.actionShortcutMap);
	}

	/**
	 * Initialize and connect to MQTT broker if enabled
	 */
	async initialize() {
		if (!this.config.enabled || !this.config.brokerUrl) {
			console.debug('[MQTT] Disabled or no broker URL configured');
			return;
		}

		try {
			const options = {
				clientId: this.config.clientId,
			};

			if (this.config.username) {
				options.username = this.config.username;
				options.password = this.config.password;
			}

			console.info(`[MQTT] Connecting to broker: ${this.config.brokerUrl}`);

			this.client = mqtt.connect(this.config.brokerUrl, options);

			this.client.on('connect', () => {
				this.isConnected = true;
				console.info('[MQTT] Successfully connected to broker');

				// Subscribe to command topic for receiving action commands (if configured)
				if (this.config.commandTopic) {
					const commandTopic = `${this.config.topicPrefix}/${this.config.commandTopic}`;
					this.client.subscribe(commandTopic, (err) => {
						if (err) {
							console.error(`[MQTT] Failed to subscribe to command topic ${commandTopic}:`, err);
						} else {
							console.info(`[MQTT] Subscribed to command topic: ${commandTopic}`);
						}
					});
				} else {
					console.debug('[MQTT] Command topic not configured, skipping command subscription');
				}
			});

			this.client.on('error', (error) => {
				console.error('[MQTT] Connection error:', error);
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
			console.error('[MQTT] Failed to initialize client:', error);
		}
	}

	/**
	 * Generic publish method for publishing any payload to MQTT
	 * @param {string} topic - Full MQTT topic path
	 * @param {string|object} payload - Payload to publish (will be converted to string)
	 * @param {object} options - MQTT publish options
	 * @param {boolean} options.retain - Whether to retain the message (default: true)
	 * @param {number} options.qos - Quality of Service level (default: 0)
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
				qos: options.qos ?? 0
			});

			console.debug(`[MQTT] Published to ${topic}: ${payloadString.substring(0, 100)}`);
		} catch (error) {
			console.error(`[MQTT] Failed to publish to ${topic}:`, error);
		}
	}

	/**
	 * Publish Teams status to MQTT topic
	 * @param {number|string} status - Teams status code
	 */
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
			console.debug(`[MQTT] Published status: ${statusString} (${status}) on topic: ${topic}`);

		} catch (error) {
			console.error('[MQTT] Failed to publish status:', error);
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
			// Parse JSON
			const command = JSON.parse(messageString);

			// Validate command structure
			if (!command || typeof command !== 'object') {
				console.warn('[MQTT] Invalid command: not an object');
				return;
			}

			if (!command.action || typeof command.action !== 'string') {
				console.warn('[MQTT] Invalid command: missing or invalid action');
				return;
			}

			// Whitelist validation
			if (!this.allowedActions.includes(command.action)) {
				console.warn(`[MQTT] Invalid command: action '${command.action}' not in whitelist`);
				return;
			}

			console.info(`[MQTT] Received valid command: ${command.action}`);

			// Emit command event for main process to handle
			const shortcut = this.actionShortcutMap[command.action];
			this.emit('command', { action: command.action, shortcut });

		} catch (error) {
			console.error('[MQTT] Failed to handle command:', error.message);
		}
	}

	/**
	 * Close MQTT connection
	 */
	async disconnect() {
		if (this.client) {
			console.debug('[MQTT] Disconnecting from broker');
			try {
				await this.client.end(false);
			} catch (error) {
				console.error('[MQTT] Error disconnecting:', error);
			}
			this.client = null;
			this.isConnected = false;
		}
	}
}

module.exports = { MQTTClient };

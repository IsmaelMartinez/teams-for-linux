const mqtt = require('mqtt');
const { EventEmitter } = require('node:events');

/**
 * MQTT Client for Teams Status Publishing and Command Reception
 * Manages connection, publishing of Teams status updates, and receiving action commands from an MQTT broker
 */
class MQTTClient extends EventEmitter {
	constructor(config, commandExecutor = null) {
		super();
		this.config = config.mqtt;
		this.client = null;
		this.isConnected = false;
		this.lastPublishedStatus = null;
		this.commandExecutor = commandExecutor;
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
			'raise-hand': 'Ctrl+Shift+K'
		};

		// Rate limiting: track last command timestamp (max 1 command/sec)
		this.lastCommandTime = 0;
		this.commandRateLimitMs = 1000;
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
			console.debug('MQTT disabled or no broker URL configured');
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

			console.info(`Connecting to MQTT broker: ${this.config.brokerUrl}`);

			this.client = mqtt.connect(this.config.brokerUrl, options);

			this.client.on('connect', () => {
				this.isConnected = true;
				console.info('Successfully connected to MQTT broker');

				// Subscribe to command topic for receiving action commands
				const commandTopic = `${this.config.topicPrefix}/${this.config.commandTopic}`;
				this.client.subscribe(commandTopic, (err) => {
					if (err) {
						console.error(`Failed to subscribe to command topic ${commandTopic}:`, err);
					} else {
						console.info(`Subscribed to MQTT command topic: ${commandTopic}`);
					}
				});
			});

			this.client.on('error', (error) => {
				console.error('MQTT connection error:', error);
				this.isConnected = false;
			});

			this.client.on('close', () => {
				this.isConnected = false;
				console.debug('MQTT connection closed');
			});

			this.client.on('reconnect', () => {
				console.debug('Reconnecting to MQTT broker');
			});

			this.client.on('message', (topic, message) => {
				const commandTopic = `${this.config.topicPrefix}/${this.config.commandTopic}`;
				if (topic === commandTopic) {
					this.handleCommand(message.toString());
				}
			});

		} catch (error) {
			console.error('Failed to initialize MQTT client:', error);
		}
	}

	/**
	 * Publish Teams status to MQTT topic
	 * @param {number|string} status - Teams status code
	 */
	async publishStatus(status) {
		if (!this.isConnected || !this.client) {
			console.debug('MQTT not connected, skipping status publish');
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
			console.debug(`Published Teams status to MQTT: ${statusString} (${status}) on topic: ${topic}`);

		} catch (error) {
			console.error('Failed to publish status to MQTT:', error);
		}
	}

	/**
	 * Handle incoming MQTT command
	 * Validates and processes command messages, executing them via the commandExecutor callback
	 *
	 * @param {string} messageString - Raw message string from MQTT
	 *
	 * Security features:
	 * - JSON validation
	 * - Action whitelist (only allowed actions are processed)
	 * - Rate limiting (max 1 command per second)
	 */
	handleCommand(messageString) {
		try {
			// Rate limiting check
			const now = Date.now();
			if (now - this.lastCommandTime < this.commandRateLimitMs) {
				console.warn('MQTT command rate limit exceeded, ignoring command');
				return;
			}

			// Parse JSON
			const command = JSON.parse(messageString);

			// Validate command structure
			if (!command || typeof command !== 'object') {
				console.warn('Invalid MQTT command: not an object');
				return;
			}

			if (!command.action || typeof command.action !== 'string') {
				console.warn('Invalid MQTT command: missing or invalid action');
				return;
			}

			// Whitelist validation
			if (!this.allowedActions.includes(command.action)) {
				console.warn(`Invalid MQTT command: action '${command.action}' not in whitelist`);
				return;
			}

			// Update rate limit timestamp
			this.lastCommandTime = now;

			console.info(`Received valid MQTT command: ${command.action}`);

			// Execute the command via the executor callback
			const shortcut = this.actionShortcutMap[command.action];
			if (shortcut && this.commandExecutor) {
				this.commandExecutor(shortcut, command.action);
			} else if (!this.commandExecutor) {
				console.warn('No command executor configured for MQTT commands');
			}

		} catch (error) {
			console.error('Failed to handle MQTT command:', error.message);
		}
	}

	/**
	 * Close MQTT connection
	 */
	async disconnect() {
		if (this.client) {
			console.debug('Disconnecting from MQTT broker');
			try {
				await this.client.end(false);
			} catch (error) {
				console.error('Error disconnecting from MQTT broker:', error);
			}
			this.client = null;
			this.isConnected = false;
		}
	}
}

module.exports = { MQTTClient };

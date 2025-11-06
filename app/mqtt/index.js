const mqtt = require('mqtt');

/**
 * MQTT Client for Teams Status Publishing
 * Manages connection and publishing of Teams status updates to an MQTT broker
 */
class MQTTClient {
	constructor(config) {
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
	 * Close MQTT connection
	 */
	async disconnect() {
		if (this.client) {
			console.debug('Disconnecting from MQTT broker');
			try {
				// mqtt.js uses callback-based API, wrap in promise
				await new Promise((resolve) => {
					this.client.end(false, () => resolve());
				});
			} catch (error) {
				console.error('Error disconnecting from MQTT broker:', error);
			}
			this.client = null;
			this.isConnected = false;
		}
	}
}

module.exports = { MQTTClient };

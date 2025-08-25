const mqtt = require('mqtt');
const logger = require('electron-log');

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
			logger.debug('MQTT disabled or no broker URL configured');
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

			logger.info(`Connecting to MQTT broker: ${this.config.brokerUrl}`);
			
			this.client = mqtt.connect(this.config.brokerUrl, options);

			this.client.on('connect', () => {
				this.isConnected = true;
				logger.info('Successfully connected to MQTT broker');
			});

			this.client.on('error', (error) => {
				logger.error('MQTT connection error:', error);
				this.isConnected = false;
			});

			this.client.on('close', () => {
				this.isConnected = false;
				logger.debug('MQTT connection closed');
			});

			this.client.on('reconnect', () => {
				logger.debug('Reconnecting to MQTT broker');
			});

		} catch (error) {
			logger.error('Failed to initialize MQTT client:', error);
		}
	}

	/**
	 * Publish Teams status to MQTT topic
	 * @param {number|string} status - Teams status code
	 */
	async publishStatus(status) {
		if (!this.isConnected || !this.client) {
			logger.debug('MQTT not connected, skipping status publish');
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
			await new Promise((resolve, reject) => {
				this.client.publish(topic, payload, { retain: true }, (error) => {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				});
			});

			this.lastPublishedStatus = statusString;
			logger.debug(`Published Teams status to MQTT: ${statusString} (${status}) on topic: ${topic}`);

		} catch (error) {
			logger.error('Failed to publish status to MQTT:', error);
		}
	}

	/**
	 * Close MQTT connection
	 */
	async disconnect() {
		if (this.client) {
			logger.debug('Disconnecting from MQTT broker');
			await new Promise((resolve) => {
				this.client.end(false, resolve);
			});
			this.client = null;
			this.isConnected = false;
		}
	}

	/**
	 * Get current connection status
	 */
	getConnectionStatus() {
		return {
			enabled: this.config.enabled,
			connected: this.isConnected,
			brokerUrl: this.config.brokerUrl,
			clientId: this.config.clientId,
			lastPublishedStatus: this.lastPublishedStatus
		};
	}
}

module.exports = { MQTTClient };
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { MQTTClient } = require('../../app/mqtt');

function connectedClient() {
	const client = new MQTTClient({ mqtt: { topicPrefix: 'teams' } });
	client.isConnected = true;
	client.client = { publish: async () => {} };
	return client;
}

describe('MQTTClient.publish logging', () => {
	let logged;
	let original;

	beforeEach(() => {
		logged = [];
		original = { debug: console.debug, error: console.error };
		console.debug = (...args) => logged.push(args.join(' '));
		console.error = (...args) => logged.push(args.map((a) => JSON.stringify(a)).join(' '));
	});

	afterEach(() => {
		console.debug = original.debug;
		console.error = original.error;
	});

	it('logs neither topic nor payload when redactLog is set', async () => {
		await connectedClient().publish('teams/secret-topic', '{"name":"Pat Example"}', { redactLog: true });
		assert.ok(logged.length > 0);
		assert.ok(logged.every((line) => !line.includes('secret-topic') && !line.includes('Pat Example')));
	});

	it('keeps them out of a failure too', async () => {
		const client = connectedClient();
		client.client.publish = async () => {
			throw new Error('broker gone');
		};
		await client.publish('teams/secret-topic', '{"name":"Pat Example"}', { redactLog: true });
		assert.ok(logged.some((line) => line.includes('broker gone')));
		assert.ok(logged.every((line) => !line.includes('secret-topic') && !line.includes('Pat Example')));
	});

	it('still logs the topic for an ordinary publish', async () => {
		await connectedClient().publish('teams/in-call', 'true');
		assert.ok(logged.some((line) => line.includes('teams/in-call')));
	});
});

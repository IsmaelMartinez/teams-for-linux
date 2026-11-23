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

	it('logs neither topic nor payload', async () => {
		await connectedClient().publish('teams/secret-topic', '{"name":"Pat Example"}');
		assert.ok(logged.length > 0);
		assert.ok(logged.every((line) => !line.includes('secret-topic') && !line.includes('Pat Example')));
	});

	it('logs only the error code of a failure, never the topic, payload or message', async () => {
		const client = connectedClient();
		client.client.publish = async () => {
			const error = new Error('getaddrinfo ENOTFOUND mqtt.corp.example');
			error.code = 'ENOTFOUND';
			throw error;
		};
		await client.publish('teams/secret-topic', '{"name":"Pat Example"}');
		assert.ok(logged.some((line) => line.includes('ENOTFOUND')));
		assert.ok(logged.every((line) => !line.includes('secret-topic') && !line.includes('Pat Example') && !line.includes('corp.example')));
	});

	it('keeps the topic out of status and custom-topic publishes', async () => {
		const client = new MQTTClient({ mqtt: { topicPrefix: 'teams', statusTopic: 'secret-status' } });
		client.isConnected = true;
		client.client = { publish: async () => {} };
		await client.publishStatus(2);
		await client.publishToTopic('secret-custom', { a: 1 });
		assert.ok(logged.length >= 2);
		assert.ok(logged.every((line) => !line.includes('secret-status') && !line.includes('secret-custom') && !line.includes('teams/')));
	});

	it('does not echo an unknown command action', (t) => {
		const warnings = [];
		t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
		connectedClient().handleCommand(JSON.stringify({ action: 'not-a-real-action\nforged line' }));
		assert.strictEqual(warnings.length, 1);
		assert.ok(!warnings[0].includes('not-a-real-action'), warnings[0]);
	});
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

// We test the MQTTClient class directly but only the pure logic
// (handleCommand, publishStatus deduplication, statusMap, allowedActions).
// We don't call initialize() since that requires a real mqtt broker.
const { MQTTClient } = require('../../app/mqtt/index');

function createClient(overrides = {}) {
	return new MQTTClient({
		mqtt: {
			enabled: true,
			brokerUrl: 'mqtt://localhost',
			topicPrefix: 'teams',
			statusTopic: 'status',
			commandTopic: 'command',
			clientId: 'test-client',
			...overrides,
		}
	});
}

describe('MQTT handleCommand - valid commands', () => {
	it('emits command event for toggle-mute', () => {
		const client = createClient();
		let emitted = null;
		client.on('command', (cmd) => { emitted = cmd; });

		client.handleCommand(JSON.stringify({ action: 'toggle-mute' }));

		assert.ok(emitted, 'Should have emitted a command event');
		assert.strictEqual(emitted.action, 'toggle-mute');
		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+M');
	});

	it('emits command event for toggle-video', () => {
		const client = createClient();
		let emitted = null;
		client.on('command', (cmd) => { emitted = cmd; });

		client.handleCommand(JSON.stringify({ action: 'toggle-video' }));

		assert.strictEqual(emitted.action, 'toggle-video');
		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+O');
	});

	it('emits command event for toggle-hand-raise', () => {
		const client = createClient();
		let emitted = null;
		client.on('command', (cmd) => { emitted = cmd; });

		client.handleCommand(JSON.stringify({ action: 'toggle-hand-raise' }));

		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+K');
	});

	it('emits command event for get-calendar (non-shortcut action)', () => {
		const client = createClient();
		let emitted = null;
		client.on('command', (cmd) => { emitted = cmd; });

		client.handleCommand(JSON.stringify({ action: 'get-calendar' }));

		assert.ok(emitted);
		assert.strictEqual(emitted.action, 'get-calendar');
		assert.strictEqual(emitted.shortcut, undefined);
	});

	it('preserves extra fields from command payload', () => {
		const client = createClient();
		let emitted = null;
		client.on('command', (cmd) => { emitted = cmd; });

		client.handleCommand(JSON.stringify({ action: 'toggle-mute', requestId: '123' }));

		assert.strictEqual(emitted.requestId, '123');
	});
});

describe('MQTT handleCommand - invalid commands', () => {
	it('rejects invalid JSON', () => {
		const client = createClient();
		let emitted = false;
		client.on('command', () => { emitted = true; });

		client.handleCommand('not valid json{');

		assert.strictEqual(emitted, false);
	});

	it('rejects non-object JSON values', () => {
		const client = createClient();
		let emitted = false;
		client.on('command', () => { emitted = true; });

		client.handleCommand('"just a string"');
		assert.strictEqual(emitted, false);

		client.handleCommand('42');
		assert.strictEqual(emitted, false);

		client.handleCommand('null');
		assert.strictEqual(emitted, false);
	});

	it('rejects command without action field', () => {
		const client = createClient();
		let emitted = false;
		client.on('command', () => { emitted = true; });

		client.handleCommand(JSON.stringify({ type: 'toggle-mute' }));

		assert.strictEqual(emitted, false);
	});

	it('rejects command with non-string action', () => {
		const client = createClient();
		let emitted = false;
		client.on('command', () => { emitted = true; });

		client.handleCommand(JSON.stringify({ action: 123 }));
		assert.strictEqual(emitted, false);

		client.handleCommand(JSON.stringify({ action: true }));
		assert.strictEqual(emitted, false);

		client.handleCommand(JSON.stringify({ action: null }));
		assert.strictEqual(emitted, false);
	});

	it('rejects actions not in the whitelist', () => {
		const client = createClient();
		let emitted = false;
		client.on('command', () => { emitted = true; });

		client.handleCommand(JSON.stringify({ action: 'delete-all-messages' }));
		assert.strictEqual(emitted, false);

		client.handleCommand(JSON.stringify({ action: 'exec' }));
		assert.strictEqual(emitted, false);

		client.handleCommand(JSON.stringify({ action: '' }));
		assert.strictEqual(emitted, false);
	});

	it('rejects empty message', () => {
		const client = createClient();
		let emitted = false;
		client.on('command', () => { emitted = true; });

		client.handleCommand('');

		assert.strictEqual(emitted, false);
	});
});

describe('MQTT allowedActions', () => {
	it('includes all shortcut actions', () => {
		const client = createClient();
		const allowed = client.allowedActions;

		assert.ok(allowed.includes('toggle-mute'));
		assert.ok(allowed.includes('toggle-video'));
		assert.ok(allowed.includes('toggle-hand-raise'));
	});

	it('includes non-shortcut actions', () => {
		const client = createClient();
		assert.ok(client.allowedActions.includes('get-calendar'));
	});

	it('does not include arbitrary strings', () => {
		const client = createClient();
		assert.ok(!client.allowedActions.includes('arbitrary'));
	});
});

describe('MQTT statusMap', () => {
	it('maps known status codes to strings', () => {
		const client = createClient();
		assert.strictEqual(client.statusMap['1'], 'available');
		assert.strictEqual(client.statusMap['2'], 'busy');
		assert.strictEqual(client.statusMap['3'], 'do_not_disturb');
		assert.strictEqual(client.statusMap['4'], 'away');
		assert.strictEqual(client.statusMap['5'], 'be_right_back');
		assert.strictEqual(client.statusMap['-1'], 'unknown');
	});

	it('returns undefined for unmapped codes', () => {
		const client = createClient();
		assert.strictEqual(client.statusMap['99'], undefined);
		assert.strictEqual(client.statusMap['0'], undefined);
	});
});

describe('MQTT publishStatus deduplication', () => {
	it('skips publish when status has not changed', async () => {
		const client = createClient();
		client.isConnected = true;
		let publishCount = 0;
		client.client = {
			publish: async () => { publishCount++; },
		};

		await client.publishStatus(1);
		await client.publishStatus(1);

		assert.strictEqual(publishCount, 1, 'Should only publish once for same status');
	});

	it('publishes when status changes', async () => {
		const client = createClient();
		client.isConnected = true;
		let publishCount = 0;
		client.client = {
			publish: async () => { publishCount++; },
		};

		await client.publishStatus(1);
		await client.publishStatus(2);

		assert.strictEqual(publishCount, 2, 'Should publish for each status change');
	});

	it('skips publish when not connected', async () => {
		const client = createClient();
		client.isConnected = false;
		let publishCount = 0;
		client.client = {
			publish: async () => { publishCount++; },
		};

		await client.publishStatus(1);

		assert.strictEqual(publishCount, 0);
	});
});

describe('MQTTClient is an EventEmitter', () => {
	it('extends EventEmitter', () => {
		const client = createClient();
		assert.ok(client instanceof EventEmitter);
	});
});

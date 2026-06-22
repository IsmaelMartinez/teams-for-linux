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

/** Create a client, fire a command, and return the emitted command object (or null). */
function fireAndCapture(payload) {
	const client = createClient();
	let emitted = null;
	client.on('command', (cmd) => { emitted = cmd; });
	const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
	client.handleCommand(raw);
	return emitted;
}

describe('MQTT handleCommand - valid commands', () => {
	it('emits command event for toggle-mute', () => {
		const emitted = fireAndCapture({ action: 'toggle-mute' });
		assert.ok(emitted, 'Should have emitted a command event');
		assert.strictEqual(emitted.action, 'toggle-mute');
		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+M');
	});

	it('emits command event for toggle-video', () => {
		const emitted = fireAndCapture({ action: 'toggle-video' });
		assert.strictEqual(emitted.action, 'toggle-video');
		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+O');
	});

	it('emits command event for toggle-hand-raise', () => {
		const emitted = fireAndCapture({ action: 'toggle-hand-raise' });
		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+K');
	});

	it('emits command event for get-calendar (non-shortcut action)', () => {
		const emitted = fireAndCapture({ action: 'get-calendar' });
		assert.ok(emitted);
		assert.strictEqual(emitted.action, 'get-calendar');
		assert.strictEqual(emitted.shortcut, undefined);
	});

	it('preserves extra fields from command payload', () => {
		const emitted = fireAndCapture({ action: 'toggle-mute', requestId: '123' });
		assert.strictEqual(emitted.requestId, '123');
	});

	it('emits command event for mute', () => {
		const emitted = fireAndCapture({ action: 'mute' });
		assert.ok(emitted, 'Should have emitted a command event');
		assert.strictEqual(emitted.action, 'mute');
		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+M');
	});

	it('emits command event for unmute', () => {
		const emitted = fireAndCapture({ action: 'unmute' });
		assert.ok(emitted, 'Should have emitted a command event');
		assert.strictEqual(emitted.action, 'unmute');
		assert.strictEqual(emitted.shortcut, 'Ctrl+Shift+M');
	});

	it('preserves force flag in mute command', () => {
		const emitted = fireAndCapture({ action: 'mute', force: true });
		assert.ok(emitted);
		assert.strictEqual(emitted.action, 'mute');
		assert.strictEqual(emitted.force, true);
	});

	it('preserves force flag in unmute command', () => {
		const emitted = fireAndCapture({ action: 'unmute', force: true });
		assert.ok(emitted);
		assert.strictEqual(emitted.action, 'unmute');
		assert.strictEqual(emitted.force, true);
	});
});

describe('MQTT handleCommand - invalid commands', () => {
	it('rejects invalid JSON', () => {
		assert.strictEqual(fireAndCapture('not valid json{'), null);
	});

	it('rejects non-object JSON values', () => {
		assert.strictEqual(fireAndCapture('"just a string"'), null);
		assert.strictEqual(fireAndCapture('42'), null);
		assert.strictEqual(fireAndCapture('null'), null);
	});

	it('rejects command without action field', () => {
		assert.strictEqual(fireAndCapture({ type: 'toggle-mute' }), null);
	});

	it('rejects command with non-string action', () => {
		assert.strictEqual(fireAndCapture({ action: 123 }), null);
		assert.strictEqual(fireAndCapture({ action: true }), null);
		assert.strictEqual(fireAndCapture({ action: null }), null);
	});

	it('rejects actions not in the whitelist', () => {
		assert.strictEqual(fireAndCapture({ action: 'delete-all-messages' }), null);
		assert.strictEqual(fireAndCapture({ action: 'exec' }), null);
		assert.strictEqual(fireAndCapture({ action: '' }), null);
	});

	it('rejects empty message', () => {
		assert.strictEqual(fireAndCapture(''), null);
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

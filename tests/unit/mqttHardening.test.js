'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Stub the mqtt library so initialize() can run without a broker.
const mqttPath = require.resolve('mqtt');
require.cache[mqttPath] = { id: mqttPath, filename: mqttPath, loaded: true, exports: { connect: () => ({ on() {} }) } };

const { MQTTClient, cleartextWarning } = require('../../app/mqtt/index');

let logs;
const originals = {};

beforeEach(() => {
	logs = [];
	for (const level of ['debug', 'info', 'warn', 'error']) {
		originals[level] = console[level];
		console[level] = (...args) => logs.push({ level, args });
	}
});

afterEach(() => {
	for (const [level, fn] of Object.entries(originals)) console[level] = fn;
});

const allLogText = () => JSON.stringify(logs);

function createClient(overrides = {}) {
	return new MQTTClient({
		mqtt: { enabled: true, brokerUrl: 'mqtt://localhost', topicPrefix: 'teams', statusTopic: 'status', commandTopic: 'command', clientId: 'cid', ...overrides },
	});
}

function capture(client) {
	const events = [];
	client.on('command', (event) => events.push(event));
	return events;
}

const COMMAND_TOPIC = 'teams/command';
const buffer = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

describe('MQTT command intake', () => {
	it('drops a retained command and warns once, without its content', () => {
		const client = createClient();
		const events = capture(client);
		const message = buffer({ action: 'toggle-mute', note: 'SECRET-PAYLOAD' });
		client.handleMessage(COMMAND_TOPIC, message, { retain: true });
		client.handleMessage(COMMAND_TOPIC, message, { retain: true });
		assert.deepStrictEqual(events, []);
		assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 1);
		assert.ok(!allLogText().includes('SECRET-PAYLOAD'));
		assert.ok(!allLogText().includes(COMMAND_TOPIC));
	});

	it('handles a command that is not retained', () => {
		const client = createClient();
		const events = capture(client);
		client.handleMessage(COMMAND_TOPIC, buffer({ action: 'toggle-mute' }), { retain: false });
		client.handleMessage(COMMAND_TOPIC, buffer({ action: 'toggle-video' }), undefined);
		assert.deepStrictEqual(events.map((e) => e.action), ['toggle-mute', 'toggle-video']);
	});

	it('drops a command longer than the limit before parsing it', () => {
		const client = createClient();
		const events = capture(client);
		const padded = JSON.stringify({ action: 'toggle-mute', pad: 'x'.repeat(3000), marker: 'BIG-PAYLOAD' });
		client.handleMessage(COMMAND_TOPIC, buffer(padded), { retain: false });
		assert.deepStrictEqual(events, []);
		assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 1);
		assert.ok(!allLogText().includes('BIG-PAYLOAD'));
		assert.ok(!allLogText().includes('Failed to handle'), 'the message must not reach the parser');
	});

	it('accepts a command of exactly the limit', () => {
		const client = createClient();
		const events = capture(client);
		const head = '{"action":"toggle-mute","pad":"';
		const tail = '"}';
		const message = buffer(head + 'x'.repeat(2048 - head.length - tail.length) + tail);
		assert.strictEqual(message.length, 2048);
		client.handleMessage(COMMAND_TOPIC, message, { retain: false });
		assert.strictEqual(events.length, 1);
	});

	it('ignores other topics and a missing command topic', () => {
		const client = createClient();
		const events = capture(client);
		client.handleMessage('teams/other', buffer({ action: 'toggle-mute' }), {});
		createClient({ commandTopic: '' }).handleMessage(COMMAND_TOPIC, buffer({ action: 'toggle-mute' }), {});
		assert.deepStrictEqual(events, []);
	});

	it('emits only the declared arguments of the command', () => {
		const client = createClient();
		const events = capture(client);
		client.handleCommand(JSON.stringify({ action: 'mute', force: true, extra: 'x', shortcut: 'Ctrl+Q' }));
		client.handleCommand(JSON.stringify({
			action: 'get-calendar', startDate: '2025-01-01', endDate: '2025-01-02', force: true, note: 'x',
		}));
		assert.deepStrictEqual(events, [
			{ action: 'mute', shortcut: 'Ctrl+Shift+M', force: true },
			{ action: 'get-calendar', shortcut: undefined, startDate: '2025-01-01', endDate: '2025-01-02' },
		]);
	});

	it('treats an argument of the wrong type as absent', () => {
		const client = createClient();
		const events = capture(client);
		for (const force of ['true', 1, null, {}, ['x']]) {
			client.handleCommand(JSON.stringify({ action: 'unmute', force }));
		}
		client.handleCommand(JSON.stringify({ action: 'get-calendar', startDate: ['2025-01-01'], endDate: 5 }));
		assert.ok(events.slice(0, 5).every((e) => !('force' in e)));
		assert.deepStrictEqual(events[5], { action: 'get-calendar', shortcut: undefined });
	});

	it('logs nothing of a rejected or accepted payload', () => {
		const client = createClient();
		client.handleCommand(JSON.stringify({ action: 'SECRET-ACTION', note: 'SECRET-NOTE' }));
		client.handleCommand('not json SECRET-RAW');
		client.handleCommand(JSON.stringify({ action: 'mute', force: 'SECRET-FORCE' }));
		assert.ok(!allLogText().includes('SECRET'));
	});
});

describe('MQTT publishStatus values', () => {
	function connected() {
		const client = createClient();
		const published = [];
		client.isConnected = true;
		client.client = { publish: async (topic, payload, opts) => { published.push({ topic, payload: JSON.parse(payload), opts }); } };
		return { client, published };
	}

	it('publishes an integer, naming a code the contract does not know unknown', async () => {
		const { client, published } = connected();
		await client.publishStatus(2);
		await client.publishStatus(99);
		assert.deepStrictEqual(published.map((p) => [p.payload.status, p.payload.statusCode]), [['busy', 2], ['unknown', 99]]);
		assert.strictEqual(published[0].topic, 'teams/status');
		assert.deepStrictEqual(published[0].opts, { retain: true });
	});

	it('drops anything that is not an integer', async () => {
		const { client, published } = connected();
		for (const value of ['2', '1', 'constructor', {}, { toString: () => '1' }, [1], Number.NaN, 1.5, Infinity, null, undefined, true]) {
			await client.publishStatus(value);
		}
		assert.deepStrictEqual(published, []);
		assert.strictEqual(client.lastPublishedStatus, null);
	});

	it('does not log the status', async () => {
		const { client } = connected();
		await client.publishStatus(3);
		assert.ok(!allLogText().includes('do_not_disturb'));
	});
});

describe('MQTT cleartext warning', () => {
	it('stays quiet for this machine and every TLS scheme', () => {
		for (const url of [
			'mqtt://localhost', 'mqtt://localhost:1883', 'mqtt://127.0.0.1', 'mqtt://127.1.2.3:1883', 'mqtt://[::1]', 'mqtt://[::1]:1883',
			'mqtts://broker.example', 'ssl://broker.example', 'tls://broker.example', 'wss://broker.example/mqtt',
		]) {
			assert.strictEqual(cleartextWarning(url, true), null, url);
		}
	});

	it('warns for cleartext to another host', () => {
		for (const url of ['mqtt://192.168.1.10', 'mqtt://broker.example:1883', 'ws://broker.example', 'tcp://broker.example']) {
			assert.match(cleartextWarning(url, false), /not encrypted.*password and every message travel in clear text/, url);
		}
	});

	it('adds the command sentence only with a command topic', () => {
		assert.match(cleartextWarning('mqtt://broker.example', true), /send commands/);
		assert.doesNotMatch(cleartextWarning('mqtt://broker.example', false), /send commands/);
	});

	it('does not throw or warn for an unparseable URL', () => {
		for (const url of ['', 'not a url', '://x', undefined, null]) {
			assert.strictEqual(cleartextWarning(url, true), null);
		}
	});

	it('keeps the host, URL and topic out of the warning', () => {
		const warning = cleartextWarning('mqtt://secretuser:secretpw@secrethost.example:1883/secretpath', true);
		for (const secret of ['secret', 'host.example', '1883', 'mqtt://']) {
			assert.ok(!warning.includes(secret), secret);
		}
	});

	it('warns once when the client initialises, and never throws on a bad URL', async () => {
		await createClient({ brokerUrl: 'mqtt://broker.example' }).initialize();
		assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 1);
		assert.ok(!allLogText().includes('broker.example'));

		logs.length = 0;
		await createClient({ brokerUrl: 'mqtt://localhost' }).initialize();
		assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 0);

		logs.length = 0;
		await createClient({ brokerUrl: 'not a url' }).initialize();
		assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 0);
		assert.strictEqual(logs.filter((l) => l.level === 'error').length, 0);
	});
});

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

// Stub `electron` before requiring the service, as mediaStatusService.test.js does.
const mockApp = new EventEmitter();
const mockIpcMain = new EventEmitter();
require.cache[require.resolve('electron')] = {
	id: require.resolve('electron'),
	exports: { app: mockApp, ipcMain: mockIpcMain },
	loaded: true,
};

const MQTTMediaStatusService = require('../../app/mqtt/mediaStatusService');

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('MQTTMediaStatusService values from the Teams page', () => {
	let published;

	function createService(mqttClient, mqttOverrides = {}) {
		const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams', clientId: 'cid', ...mqttOverrides } });
		service.initialize();
		return service;
	}

	function recordingClient() {
		return { publish: async (topic, payload, opts) => { published.push({ topic, payload, opts }); } };
	}

	beforeEach(() => {
		published = [];
		mockApp.removeAllListeners();
		mockIpcMain.removeAllListeners();
	});

	it('publishes the camera only for a boolean', async () => {
		createService(recordingClient());
		for (const value of ['true', 1, null, undefined, {}, ['x']]) {
			mockIpcMain.emit('camera-state-changed', undefined, value);
		}
		await flush();
		assert.deepStrictEqual(published, []);

		mockIpcMain.emit('camera-state-changed', undefined, true);
		mockIpcMain.emit('camera-state-changed', undefined, false);
		await flush();
		assert.deepStrictEqual(published.map((p) => [p.topic, p.payload]), [['teams/camera', 'true'], ['teams/camera', 'false']]);
	});

	it('drops a microphone state the topic cannot carry and changes nothing', async () => {
		const controlChanges = [];
		mockApp.on('teams-microphone-control-changed', (state) => controlChanges.push(state));
		createService(recordingClient());
		for (const value of [{ a: 1 }, ['muted'], 'unknown', 'MUTED', 7, null, undefined, '']) {
			mockIpcMain.emit('microphone-state-changed', undefined, value);
		}
		await flush();
		assert.deepStrictEqual(published, []);
		assert.deepStrictEqual(controlChanges, []);

		mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
		await flush();
		assert.deepStrictEqual(published.map((p) => [p.topic, p.payload]), [
			['teams/microphone', 'muted'], ['teams/microphone/control', 'muted'],
		]);
	});

	it('copies only string, number and boolean caller fields', async () => {
		createService(recordingClient(), { incomingCallCaller: { enabled: true } });
		mockApp.emit('teams-incoming-call-started', {
			name: { first: 'Pat' }, number: ['1'], scenario: 'call', contact: false, callId: 42, queue: () => 'q',
		});
		await flush();
		const { timestamp, ...caller } = JSON.parse(published[0].payload);
		assert.ok(timestamp);
		assert.deepStrictEqual(caller, { scenario: 'call', contact: false, callId: 42, clientId: 'cid' });
	});

	it('logs a publish failure with a code only', async () => {
		const errors = [];
		const original = console.error;
		console.error = (...args) => errors.push(args);
		try {
			createService({ publish: async () => { throw Object.assign(new Error('secret-broker.example'), { code: 'ECONNRESET' }); } });
			mockApp.emit('teams-call-connected');
			await flush();
		} finally {
			console.error = original;
		}
		assert.strictEqual(errors.length, 1);
		assert.ok(!JSON.stringify(errors).includes('secret-broker'));
		assert.ok(!JSON.stringify(errors).includes('in-call'));
		assert.deepStrictEqual(errors[0][1], { code: 'ECONNRESET' });
	});
});

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

// Minimal mock: stub `electron` module BEFORE requiring the service
const mockApp = new EventEmitter();
const mockIpcMain = new EventEmitter();
require.cache[require.resolve('electron')] = {
	id: require.resolve('electron'),
	exports: { app: mockApp, ipcMain: mockIpcMain },
	loaded: true,
};

const MQTTMediaStatusService = require('../../app/mqtt/mediaStatusService');

describe('MQTTMediaStatusService', () => {
	let published;
	let mqttClient;

	beforeEach(() => {
		published = [];
		mqttClient = {
			publish: async (topic, payload, opts) => {
				published.push({ topic, payload, opts });
			},
		};
		mockApp.removeAllListeners();
		mockIpcMain.removeAllListeners();
	});

	describe('Default topic names (backward compatibility)', () => {
		it('publishes true to in-call topic on teams-call-connected', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockApp.emit('teams-call-connected');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/in-call');
			assert.ok(hit, 'expected publish to teams/in-call');
			assert.strictEqual(hit.payload, 'true');
			assert.deepStrictEqual(hit.opts, { retain: true });
		});

		it('publishes false to in-call topic on teams-call-disconnected', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockApp.emit('teams-call-disconnected');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/in-call');
			assert.ok(hit, 'expected publish to teams/in-call');
			assert.strictEqual(hit.payload, 'false');
			assert.deepStrictEqual(hit.opts, { retain: true });
		});
	});

	describe('Configurable topic names', () => {
		it('uses custom mediaTopics configuration for inCall', async () => {
			const service = new MQTTMediaStatusService(mqttClient, {
				mqtt: {
					topicPrefix: 'teams',
					mediaTopics: { inCall: 'custom-call' },
				},
			});
			service.initialize();
			mockApp.emit('teams-call-connected');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/custom-call');
			assert.ok(hit, 'expected publish to teams/custom-call with custom topic name');
			assert.strictEqual(hit.payload, 'true');
		});

		it('uses custom mediaTopics for camera', async () => {
			const service = new MQTTMediaStatusService(mqttClient, {
				mqtt: {
					topicPrefix: 'teams',
					mediaTopics: { camera: 'webcam-status' },
				},
			});
			service.initialize();
			mockIpcMain.emit('camera-state-changed', undefined, true);
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/webcam-status');
			assert.ok(hit, 'expected publish to teams/webcam-status');
			assert.strictEqual(hit.payload, 'true');
		});

		it('uses custom mediaTopics for microphone', async () => {
			const service = new MQTTMediaStatusService(mqttClient, {
				mqtt: {
					topicPrefix: 'teams',
					mediaTopics: { microphone: 'mic-state' },
				},
			});
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/mic-state');
			assert.ok(hit, 'expected publish to teams/mic-state');
			assert.strictEqual(hit.payload, 'muted');
		});

		it('uses custom mediaTopics for screenSharing', async () => {
			const service = new MQTTMediaStatusService(mqttClient, {
				mqtt: {
					topicPrefix: 'teams',
					mediaTopics: { screenSharing: 'sharing-screen' },
				},
			});
			service.initialize();
			mockIpcMain.emit('screen-sharing-started');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/sharing-screen');
			assert.ok(hit, 'expected publish to teams/sharing-screen');
			assert.strictEqual(hit.payload, 'true');
		});
	});

	describe('Microphone state publishing', () => {
		it('publishes microphone state changes', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'speaking');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/microphone');
			assert.ok(hit, 'expected publish to teams/microphone');
			assert.strictEqual(hit.payload, 'speaking');
		});

		it('deduplicates identical microphone state messages', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await new Promise((r) => setImmediate(r));
			const count1 = published.filter((p) => p.topic === 'teams/microphone' && p.payload === 'muted').length;
			assert.strictEqual(count1, 1, 'first emission should publish');

			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await new Promise((r) => setImmediate(r));
			const count2 = published.filter((p) => p.topic === 'teams/microphone' && p.payload === 'muted').length;
			assert.strictEqual(count2, 1, 'duplicate state should not publish again');
		});
	});

	describe('Microphone control-state publishing', () => {
		it('publishes control-state "muted" when microphone is muted', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/microphone/control');
			assert.ok(hit, 'expected publish to teams/microphone/control');
			assert.strictEqual(hit.payload, 'muted');
		});

		it('publishes control-state "unmuted" when microphone is speaking', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'speaking');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/microphone/control');
			assert.ok(hit, 'expected publish to teams/microphone/control');
			assert.strictEqual(hit.payload, 'unmuted');
		});

		it('publishes control-state "unmuted" when microphone is silent', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'silent');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/microphone/control');
			assert.ok(hit, 'expected publish to teams/microphone/control');
			assert.strictEqual(hit.payload, 'unmuted');
		});

		it('publishes control-state "off" when microphone is off', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'off');
			await new Promise((r) => setImmediate(r));
			const hit = published.find((p) => p.topic === 'teams/microphone/control');
			assert.ok(hit, 'expected publish to teams/microphone/control');
			assert.strictEqual(hit.payload, 'off');
		});

		it('deduplicates identical control-state messages', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await new Promise((r) => setImmediate(r));
			const count1 = published.filter((p) => p.topic === 'teams/microphone/control' && p.payload === 'muted').length;
			assert.strictEqual(count1, 1, 'first emission should publish');

			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await new Promise((r) => setImmediate(r));
			const count2 = published.filter((p) => p.topic === 'teams/microphone/control' && p.payload === 'muted').length;
			assert.strictEqual(count2, 1, 'duplicate control-state should not publish again');
		});

		it('emits teams-microphone-control-changed event', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			let emittedControlState = null;
			mockApp.on('teams-microphone-control-changed', (state) => {
				emittedControlState = state;
			});
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await new Promise((r) => setImmediate(r));
			assert.strictEqual(emittedControlState, 'muted', 'should emit control state event');
		});
	});

	describe('Call disconnection publishes off state', () => {
		it('publishes microphone off when call disconnects', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'speaking');
			await new Promise((r) => setImmediate(r));
			published = []; // clear previous publishes

			mockApp.emit('teams-call-disconnected');
			await new Promise((r) => setImmediate(r));
			const micOff = published.find((p) => p.topic === 'teams/microphone' && p.payload === 'off');
			assert.ok(micOff, 'should publish microphone off on call disconnect');
		});

		it('publishes microphone control-state off when call disconnects', async () => {
			const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
			service.initialize();
			mockIpcMain.emit('microphone-state-changed', undefined, 'speaking');
			await new Promise((r) => setImmediate(r));
			published = []; // clear previous publishes

			mockApp.emit('teams-call-disconnected');
			await new Promise((r) => setImmediate(r));
			const controlOff = published.find((p) => p.topic === 'teams/microphone/control' && p.payload === 'off');
			assert.ok(controlOff, 'should publish microphone control-state off on call disconnect');
		});
	});
});

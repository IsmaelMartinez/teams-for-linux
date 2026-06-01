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

// ---- Test helpers -----------------------------------------------------------

function createService(mqttClient, mqttOverrides = {}) {
	const service = new MQTTMediaStatusService(mqttClient, {
		mqtt: { topicPrefix: 'teams', ...mqttOverrides },
	});
	service.initialize();
	return service;
}

async function flush() {
	await new Promise((r) => setImmediate(r));
}

async function assertDeduplicates(mqttClient, published, topic) {
	createService(mqttClient);
	mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
	await flush();
	assert.strictEqual(published.filter((p) => p.topic === topic && p.payload === 'muted').length, 1, 'first emission should publish');

	mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
	await flush();
	assert.strictEqual(published.filter((p) => p.topic === topic && p.payload === 'muted').length, 1, 'duplicate should not publish again');
}

async function assertControlState(mqttClient, published, micState, expectedControlState) {
	createService(mqttClient);
	mockIpcMain.emit('microphone-state-changed', undefined, micState);
	await flush();
	assertPublished(published, 'teams/microphone/control', expectedControlState);
}

function assertPublished(published, topic, payload, opts) {
	const hit = published.find((p) => p.topic === topic);
	assert.ok(hit, `expected publish to ${topic}`);
	assert.strictEqual(hit.payload, payload);
	if (opts !== undefined) {
		assert.deepStrictEqual(hit.opts, opts);
	}
}

// -----------------------------------------------------------------------------

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
			createService(mqttClient);
			mockApp.emit('teams-call-connected');
			await flush();
			assertPublished(published, 'teams/in-call', 'true', { retain: true });
		});

		it('publishes false to in-call topic on teams-call-disconnected', async () => {
			createService(mqttClient);
			mockApp.emit('teams-call-disconnected');
			await flush();
			assertPublished(published, 'teams/in-call', 'false');
		});
	});

	describe('Configurable topic names', () => {
		it('uses custom mediaTopics configuration for inCall', async () => {
			createService(mqttClient, { mediaTopics: { inCall: 'custom-call' } });
			mockApp.emit('teams-call-connected');
			await flush();
			assertPublished(published, 'teams/custom-call', 'true');
		});

		it('uses custom mediaTopics for camera', async () => {
			createService(mqttClient, { mediaTopics: { camera: 'webcam-status' } });
			mockIpcMain.emit('camera-state-changed', undefined, true);
			await flush();
			assertPublished(published, 'teams/webcam-status', 'true');
		});

		it('uses custom mediaTopics for microphone', async () => {
			createService(mqttClient, { mediaTopics: { microphone: 'mic-state' } });
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await flush();
			assertPublished(published, 'teams/mic-state', 'muted');
		});

		it('uses custom mediaTopics for screenSharing', async () => {
			createService(mqttClient, { mediaTopics: { screenSharing: 'sharing-screen' } });
			mockIpcMain.emit('screen-sharing-started');
			await flush();
			assertPublished(published, 'teams/sharing-screen', 'true');
		});
	});

	describe('Microphone state publishing', () => {
		it('publishes microphone state changes', async () => {
			createService(mqttClient);
			mockIpcMain.emit('microphone-state-changed', undefined, 'speaking');
			await flush();
			assertPublished(published, 'teams/microphone', 'speaking');
		});

		it('deduplicates identical microphone state messages', async () => {
			await assertDeduplicates(mqttClient, published, 'teams/microphone');
		});
	});

	describe('Microphone control-state publishing', () => {
		it('publishes control-state "muted" when microphone is muted', async () => {
			await assertControlState(mqttClient, published, 'muted', 'muted');
		});

		it('publishes control-state "unmuted" when microphone is speaking', async () => {
			await assertControlState(mqttClient, published, 'speaking', 'unmuted');
		});

		it('publishes control-state "unmuted" when microphone is silent', async () => {
			await assertControlState(mqttClient, published, 'silent', 'unmuted');
		});

		it('publishes control-state "off" when microphone is off', async () => {
			await assertControlState(mqttClient, published, 'off', 'off');
		});

		it('deduplicates identical control-state messages', async () => {
			await assertDeduplicates(mqttClient, published, 'teams/microphone/control');
		});

		it('emits teams-microphone-control-changed event', async () => {
			createService(mqttClient);
			let emittedControlState = null;
			mockApp.on('teams-microphone-control-changed', (state) => {
				emittedControlState = state;
			});
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await flush();
			assert.strictEqual(emittedControlState, 'muted', 'should emit control state event');
		});
	});

	describe('Call disconnection publishes off state', () => {
		it('publishes microphone off when call disconnects', async () => {
			createService(mqttClient);
			mockIpcMain.emit('microphone-state-changed', undefined, 'speaking');
			await flush();
			published = [];

			mockApp.emit('teams-call-disconnected');
			await flush();
			assertPublished(published, 'teams/microphone', 'off');
		});

		it('publishes microphone control-state off when call disconnects', async () => {
			createService(mqttClient);
			mockIpcMain.emit('microphone-state-changed', undefined, 'speaking');
			await flush();
			published = [];

			mockApp.emit('teams-call-disconnected');
			await flush();
			assertPublished(published, 'teams/microphone/control', 'off');
		});
	});
});

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

	async function emitAndFindPublish(eventName) {
		const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
		service.initialize();
		mockApp.emit(eventName);
		await new Promise((r) => setImmediate(r));
		return published.find((p) => p.topic === 'teams/incoming-call');
	}

	it('publishes true to incoming-call topic on teams-incoming-call-started', async () => {
		const hit = await emitAndFindPublish('teams-incoming-call-started');
		assert.ok(hit, 'expected publish to teams/incoming-call');
		assert.strictEqual(hit.payload, 'true');
		assert.deepStrictEqual(hit.opts, { retain: true });
	});

	it('publishes false to incoming-call topic on teams-incoming-call-ended', async () => {
		const hit = await emitAndFindPublish('teams-incoming-call-ended');
		assert.ok(hit, 'expected publish to teams/incoming-call');
		assert.strictEqual(hit.payload, 'false');
		assert.deepStrictEqual(hit.opts, { retain: true });
	});
});

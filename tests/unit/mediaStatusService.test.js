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

		it('derives microphoneControl from a customised microphone topic', async () => {
			createService(mqttClient, { mediaTopics: { microphone: 'mic-state' } });
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await flush();
			// control topic tracks the customised microphone topic, not the static default
			assertPublished(published, 'teams/mic-state/control', 'muted');
		});

		it('keeps an explicit microphoneControl override independent of microphone', async () => {
			createService(mqttClient, { mediaTopics: { microphone: 'mic-state', microphoneControl: 'mic-cmd' } });
			mockIpcMain.emit('microphone-state-changed', undefined, 'muted');
			await flush();
			assertPublished(published, 'teams/mic-cmd', 'muted');
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

	describe('Meeting-started pulse (#2587)', () => {
		// All tests use a tiny resetSeconds (and wait the pulse out before
		// finishing) so no pending reset timer leaks a publish into a later
		// test or keeps the node:test process alive.
		const waitForPulseReset = () => new Promise((r) => setTimeout(r, 120));

		it('publishes true to meeting-started topic on meeting-started IPC', async () => {
			createService(mqttClient, { meetingStartDetection: { resetSeconds: 0.05 } });
			mockIpcMain.emit('meeting-started');
			await flush();
			assertPublished(published, 'teams/meeting-started', 'true', { retain: true });
			await waitForPulseReset();
		});

		it('auto-resets to false after resetSeconds', async () => {
			createService(mqttClient, { meetingStartDetection: { resetSeconds: 0.05 } });
			mockIpcMain.emit('meeting-started');
			await flush();
			assertPublished(published, 'teams/meeting-started', 'true');

			await waitForPulseReset();
			const resets = published.filter(
				(p) => p.topic === 'teams/meeting-started' && p.payload === 'false'
			);
			assert.strictEqual(resets.length, 1, 'pulse should reset to false once');
		});

		it('resets to false as soon as the call is joined, before resetSeconds', async () => {
			// Long reset so a pass cannot come from the timer firing (#2587).
			createService(mqttClient, { meetingStartDetection: { resetSeconds: 60 } });
			mockIpcMain.emit('meeting-started');
			await flush();
			assertPublished(published, 'teams/meeting-started', 'true');

			mockApp.emit('teams-call-connected');
			await flush();
			const resets = published.filter(
				(p) => p.topic === 'teams/meeting-started' && p.payload === 'false'
			);
			assert.strictEqual(resets.length, 1, 'joining should drop the flag once');
		});

		it('still drops the flag when the join lands mid-publish', async () => {
			// The 'true' publish is awaited. If the reset were armed only after
			// that await, a join arriving inside it would find no timer to
			// cancel and leave the retained topic stuck at 'true' for good.
			let releaseFirstPublish;
			const gate = new Promise((r) => { releaseFirstPublish = r; });
			let first = true;
			const slowClient = {
				publish: async (topic, payload, opts) => {
					if (first && topic === 'teams/meeting-started') {
						first = false;
						await gate;
					}
					published.push({ topic, payload, opts });
				},
			};
			createService(slowClient, { meetingStartDetection: { resetSeconds: 60 } });

			mockIpcMain.emit('meeting-started');
			await flush();
			mockApp.emit('teams-call-connected'); // arrives while 'true' is in flight
			await flush();
			releaseFirstPublish();
			await flush();
			await flush();

			// Assert a reset was published at all. Arming the timer late means
			// the join finds nothing to cancel and no 'false' is ever sent.
			// (Order is not asserted: this mock records on completion, whereas
			// mqtt.js writes in call order, so the gated 'true' lands last here
			// but first on the wire.)
			const resets = published.filter(
				(p) => p.topic === 'teams/meeting-started' && p.payload === 'false'
			);
			assert.strictEqual(resets.length, 1, 'join must still drop the flag');
		});

		it('does not publish a spurious false when joining without a meeting start', async () => {
			createService(mqttClient, { meetingStartDetection: { resetSeconds: 60 } });
			mockApp.emit('teams-call-connected');
			await flush();
			const any = published.filter((p) => p.topic === 'teams/meeting-started');
			assert.strictEqual(any.length, 0, 'no meeting-started traffic without a start');
		});

		it('uses custom mediaTopics for meetingStarted', async () => {
			createService(mqttClient, {
				mediaTopics: { meetingStarted: 'meeting-live' },
				meetingStartDetection: { resetSeconds: 0.05 },
			});
			mockIpcMain.emit('meeting-started');
			await flush();
			assertPublished(published, 'teams/meeting-live', 'true');
			await waitForPulseReset();
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

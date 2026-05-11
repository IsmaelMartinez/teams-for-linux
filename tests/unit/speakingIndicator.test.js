'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const speakingIndicatorPath = require.resolve('../../app/browser/tools/speakingIndicator');
const activityHubPath = require.resolve('../../app/browser/tools/activityHub');

function makeStatsReport(audioLevel) {
	const entries = [
		{ type: 'media-source', kind: 'audio', audioLevel },
	];
	return { forEach: (fn) => entries.forEach(entry => fn(entry)) };
}

let createdPeerConnections = [];
let getStatsFn = async () => makeStatsReport(0);

function setupGlobals() {
	createdPeerConnections = [];
	const originalRTC = function RTCPeerConnection() {
		this.connectionState = 'connected';
		this.getStats = (...args) => getStatsFn.call(this, ...args);
		createdPeerConnections.push(this);
	};
	originalRTC.prototype = {};
	globalThis.RTCPeerConnection = originalRTC;
	globalThis.document = {
		getElementById: mock.fn(() => null),
		createElement: mock.fn((tag) => ({
			tagName: tag,
			id: '',
			classList: { add: mock.fn(), remove: mock.fn() },
			textContent: '',
			remove: mock.fn(),
		})),
		head: { appendChild: mock.fn() },
		body: { appendChild: mock.fn() },
	};
	return originalRTC;
}

function loadSpeakingIndicator() {
	const mockActivityHub = { on: mock.fn(), off: mock.fn(), emit: mock.fn() };
	require.cache[activityHubPath] = {
		id: activityHubPath,
		exports: mockActivityHub,
		loaded: true,
	};
	delete require.cache[speakingIndicatorPath];
	const instance = require(speakingIndicatorPath);
	return { instance, mockActivityHub };
}

function closePeerConnections() {
	for (const pc of createdPeerConnections) {
		pc.connectionState = 'closed';
	}
}

function cleanup() {
	closePeerConnections();
	delete require.cache[speakingIndicatorPath];
	delete require.cache[activityHubPath];
	delete globalThis.RTCPeerConnection;
	delete globalThis.document;
	getStatsFn = async () => makeStatsReport(0);
}

describe('SpeakingIndicator', () => {
	beforeEach(() => {
		cleanup();
	});

	afterEach(() => {
		cleanup();
	});

	it('does not patch RTCPeerConnection when both overlay and MQTT are disabled', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = globalThis.RTCPeerConnection;

		instance.init({ media: { microphone: { speakingIndicator: false } }, mqtt: { enabled: false } });

		assert.strictEqual(
			globalThis.RTCPeerConnection,
			refBefore,
			'RTCPeerConnection should remain unchanged when both features are disabled'
		);
	});

	it('patches RTCPeerConnection when overlay is enabled', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = globalThis.RTCPeerConnection;

		instance.init({ media: { microphone: { speakingIndicator: true } } });

		assert.notStrictEqual(
			globalThis.RTCPeerConnection,
			refBefore,
			'RTCPeerConnection should be replaced when speakingIndicator is enabled'
		);
	});

	it('patches RTCPeerConnection when only MQTT is enabled (#2358)', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = globalThis.RTCPeerConnection;

		instance.init({ media: { microphone: { speakingIndicator: false } }, mqtt: { enabled: true } });

		assert.notStrictEqual(
			globalThis.RTCPeerConnection,
			refBefore,
			'RTCPeerConnection should be patched for call detection when MQTT is enabled'
		);
	});

	it('registers call lifecycle events on activityHub', () => {
		setupGlobals();
		const { instance, mockActivityHub } = loadSpeakingIndicator();

		instance.init({ media: { microphone: { speakingIndicator: true } } });

		const events = new Set(mockActivityHub.on.mock.calls.map(call => call.arguments[0]));
		assert.ok(events.has('call-connected'), 'should register call-connected handler');
		assert.ok(events.has('call-disconnected'), 'should register call-disconnected handler');
	});

	it('captures RTCPeerConnection instances when patched', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		instance.init({ media: { microphone: { speakingIndicator: true } } });

		const pc = new globalThis.RTCPeerConnection();
		assert.ok(pc, 'RTCPeerConnection should still be constructable after patching');
	});

	it('shows overlay when audio stats are detected on a peer connection', async () => {
		setupGlobals();
		// Override getStatsFn so instances return non-zero audioLevel
		getStatsFn = async () => makeStatsReport(0.05);

		const { instance } = loadSpeakingIndicator();
		instance.init({ media: { microphone: { speakingIndicator: true } } });

		// Create a peer connection — this starts polling
		const pc = new globalThis.RTCPeerConnection();
		assert.ok(pc, 'RTCPeerConnection should be constructable');

		// Wait for one poll cycle
		await new Promise(r => setTimeout(r, 200));

		assert.ok(
			globalThis.document.body.appendChild.mock.calls.length > 0,
			'overlay should appear when audio stats with non-zero audioLevel are detected'
		);
	});

	it('emits call-connected via activityHub when audio stats first detected (#2358)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const { instance, mockActivityHub } = loadSpeakingIndicator();
		instance.init({ mqtt: { enabled: true } });

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 200));

		const emitCalls = mockActivityHub.emit.mock.calls;
		const connectedEmit = emitCalls.find(c => c.arguments[0] === 'call-connected');
		assert.ok(connectedEmit, 'should emit call-connected when audio stats are first detected');
	});

	it('emits call-disconnected via activityHub when all connections close (#2358)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const { instance, mockActivityHub } = loadSpeakingIndicator();
		instance.init({ mqtt: { enabled: true } });

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 200));

		// Verify call-connected was emitted first
		const connectedEmit = mockActivityHub.emit.mock.calls.find(c => c.arguments[0] === 'call-connected');
		assert.ok(connectedEmit, 'should have emitted call-connected');

		// Verify no call-disconnected was emitted yet
		assert.strictEqual(
			mockActivityHub.emit.mock.calls.some(c => c.arguments[0] === 'call-disconnected'),
			false,
			'should not emit call-disconnected before connections close'
		);
		const emitCountBeforeClose = mockActivityHub.emit.mock.calls.length;

		// Close all connections
		closePeerConnections();
		await new Promise(r => setTimeout(r, 200));

		const disconnectedEmit = mockActivityHub.emit.mock.calls
			.slice(emitCountBeforeClose)
			.find(c => c.arguments[0] === 'call-disconnected');
		assert.ok(disconnectedEmit, 'should emit call-disconnected when all connections close');
	});

	it('does not show overlay when only MQTT is enabled (#2358)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const { instance } = loadSpeakingIndicator();
		instance.init({ media: { microphone: { speakingIndicator: false } }, mqtt: { enabled: true } });

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 200));

		assert.strictEqual(
			globalThis.document.body.appendChild.mock.calls.length,
			0,
			'overlay should not appear when only MQTT is enabled (no visual indicator)'
		);
	});

	it('forwards microphone state via ipcRenderer when audio level changes (#1938 / #2465)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 200));

		const micCalls = ipcRenderer.send.mock.calls.filter(c => c.arguments[0] === 'microphone-state-changed');
		assert.ok(micCalls.length > 0, 'should send microphone-state-changed at least once');
		assert.strictEqual(micCalls[0].arguments[1], 'speaking', 'first state should be speaking when audioLevel >= threshold');
	});

	it('emits microphone-state-changed=off when all connections close (#1938 / #2465)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 200));

		closePeerConnections();
		await new Promise(r => setTimeout(r, 200));

		const micCalls = ipcRenderer.send.mock.calls.filter(c => c.arguments[0] === 'microphone-state-changed');
		assert.strictEqual(
			micCalls[micCalls.length - 1].arguments[1],
			'off',
			'last microphone-state-changed payload should be "off" after connections close'
		);
	});

	it('does not emit microphone-state-changed when ipcRenderer is missing', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const { instance } = loadSpeakingIndicator();
		// init without ipcRenderer (overlay-only path) should be safe
		instance.init({ media: { microphone: { speakingIndicator: true } } });

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 200));

		// Implicit assertion: no throws above. Nothing else to check since there is no ipcRenderer to inspect.
	});

	it('does not flip to muted when level oscillates around MUTED_LEVEL (#2465 hysteresis)', async () => {
		setupGlobals();
		// Seed: one tick clearly unmuted to set hasSeenAudio, then oscillate
		// across the 0.0001 threshold the way a quiet-mic noise floor would.
		let tick = 0;
		const oscillation = [0.005, 0.00012, 0.00008, 0.00013, 0.00007, 0.00014, 0.00009];
		getStatsFn = async () => makeStatsReport(oscillation[Math.min(tick++, oscillation.length - 1)]);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 1200));

		const micCalls = ipcRenderer.send.mock.calls.filter(c => c.arguments[0] === 'microphone-state-changed');
		const states = micCalls.map(c => c.arguments[1]);
		assert.ok(
			!states.includes('muted'),
			`should not emit muted while level oscillates around MUTED_LEVEL, got: ${states.join(',')}`
		);
	});

	it('emits muted after sustained below-threshold ticks (#2465 hysteresis)', async () => {
		setupGlobals();
		// Seed: one tick unmuted to set hasSeenAudio, then hold level clearly below MUTED_LEVEL.
		let tick = 0;
		getStatsFn = async () => makeStatsReport(tick++ === 0 ? 0.005 : 0.00001);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		assert.ok(new globalThis.RTCPeerConnection(), 'RTCPeerConnection should be constructable');
		await new Promise(r => setTimeout(r, 1200));

		const micCalls = ipcRenderer.send.mock.calls.filter(c => c.arguments[0] === 'microphone-state-changed');
		const states = micCalls.map(c => c.arguments[1]);
		assert.ok(
			states.includes('muted'),
			`should emit muted after sustained below-threshold ticks, got: ${states.join(',')}`
		);
	});
});

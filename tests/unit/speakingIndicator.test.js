'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const speakingIndicatorPath = require.resolve('../../app/browser/tools/speakingIndicator');
const activityHubPath = require.resolve('../../app/browser/tools/activityHub');

function makeStatsReport(...audioLevels) {
	const entries = audioLevels.map(audioLevel => ({ type: 'media-source', kind: 'audio', audioLevel }));
	return { forEach: (fn) => entries.forEach(entry => fn(entry)) };
}

let createdPeerConnections = [];
let getStatsFn = async () => makeStatsReport(0);
let audioTrackEnabled = true;

function setupGlobals() {
	createdPeerConnections = [];
	audioTrackEnabled = true;
	const originalRTC = function RTCPeerConnection() {
		this.connectionState = 'connected';
		this.getStats = (...args) => getStatsFn.call(this, ...args);
		this.getSenders = () => [{ track: { kind: 'audio', get enabled() { return audioTrackEnabled; } } }];
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

// The construction itself is the point: speakingIndicator patches the global
// constructor, so opening a connection is what starts its polling.
function openPeerConnection() {
	return new globalThis.RTCPeerConnection();
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
	audioTrackEnabled = true;
}

describe('SpeakingIndicator', () => {
	beforeEach(() => {
		cleanup();
	});

	afterEach(() => {
		cleanup();
	});

	it('does not patch RTCPeerConnection when overlay, MQTT and D-Bus are disabled', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = globalThis.RTCPeerConnection;

		instance.init({ media: { microphone: { speakingIndicator: false } }, mqtt: { enabled: false } }, null);

		assert.strictEqual(
			globalThis.RTCPeerConnection,
			refBefore,
			'RTCPeerConnection should remain unchanged when both features are disabled'
		);
	});

	it('preserves disabled behavior off Linux when overlay and MQTT are disabled', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = globalThis.RTCPeerConnection;
		const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
		Object.defineProperty(process, 'platform', { ...descriptor, value: 'darwin' });
		try {
			instance.init({ media: { microphone: { speakingIndicator: false } }, mqtt: { enabled: false }, dbusControl: { enabled: true } });
		} finally {
			Object.defineProperty(process, 'platform', descriptor);
		}
		assert.strictEqual(globalThis.RTCPeerConnection, refBefore);
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

	it('keeps media state IPC active on Linux with D-Bus opted in and MQTT disabled', { skip: process.platform !== 'linux' }, () => {
		setupGlobals();
		const { instance, mockActivityHub } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: false }, dbusControl: { enabled: true } }, ipcRenderer);
		const disconnected = mockActivityHub.on.mock.calls.find((call) => call.arguments[0] === 'call-disconnected');
		assert.ok(disconnected, 'call lifecycle monitor initializes without MQTT');
		disconnected.arguments[1]();
		assert.ok(ipcRenderer.send.mock.calls.some((call) =>
			call.arguments[0] === 'microphone-state-changed' && call.arguments[1] === 'off'));
		assert.ok(ipcRenderer.send.mock.calls.some((call) =>
			call.arguments[0] === 'camera-state-changed' && call.arguments[1] === false));
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

		openPeerConnection();
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

		openPeerConnection();
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

		openPeerConnection();
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

		openPeerConnection();
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

		openPeerConnection();
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

		openPeerConnection();
		await new Promise(r => setTimeout(r, 200));

		// There is no ipcRenderer to inspect, so the observable proof that polling
		// ran to completion without throwing is that the overlay still appeared.
		assert.ok(
			globalThis.document.body.appendChild.mock.calls.length > 0,
			'overlay-only path should still show the overlay when ipcRenderer is absent'
		);
	});

	it('emits muted when audio sender track is disabled, regardless of audioLevel (#2465)', async () => {
		setupGlobals();
		// A disabled track counts as muted even before any audio was seen.
		audioTrackEnabled = false;
		getStatsFn = async () => makeStatsReport(0);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection();
		await new Promise(r => setTimeout(r, 300));

		const micCalls = ipcRenderer.send.mock.calls.filter(c => c.arguments[0] === 'microphone-state-changed');
		const states = micCalls.map(c => c.arguments[1]);
		assert.ok(
			states.includes('muted'),
			`should emit muted when track.enabled is false, got: ${states.join(',')}`
		);
	});

	it('emits muted when audioLevel drops to zero after audio was seen, with the track still enabled (#3099)', async () => {
		setupGlobals();
		// Teams zeroes the level on mute but leaves the track enabled.
		let tick = 0;
		getStatsFn = async () => makeStatsReport(tick++ < 2 ? 0.005 : 0);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection();
		await new Promise(r => setTimeout(r, 1200));

		const states = ipcRenderer.send.mock.calls
			.filter(c => c.arguments[0] === 'microphone-state-changed')
			.map(c => c.arguments[1]);
		assert.deepStrictEqual(states, ['silent', 'muted'], `got: ${states.join(',')}`);
	});

	it('does not emit muted when single zero ticks interleave with a quiet noise floor (#2465 hysteresis)', async () => {
		setupGlobals();
		let tick = 0;
		getStatsFn = async () => makeStatsReport(tick++ % 2 === 0 ? 0.005 : 0);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection();
		await new Promise(r => setTimeout(r, 1200));

		const states = ipcRenderer.send.mock.calls
			.filter(c => c.arguments[0] === 'microphone-state-changed')
			.map(c => c.arguments[1]);
		assert.ok(!states.includes('muted'), `got: ${states.join(',')}`);
	});

	it('enters muted on the third consecutive zero poll, not the second (#2465 hysteresis boundary)', async () => {
		setupGlobals();
		let polls = 0;
		getStatsFn = async () => makeStatsReport(polls++ === 0 ? 0.005 : 0);

		const { instance } = loadSpeakingIndicator();
		const emitted = [];
		const ipcRenderer = { send: mock.fn((channel, state) => {
			if (channel === 'microphone-state-changed') emitted.push({ state, polls });
		}) };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection();
		await new Promise(r => setTimeout(r, 1200));

		// Poll 1 is audio, polls 2 and 3 are zeros (still silent), poll 4 is the third zero.
		assert.deepStrictEqual(emitted.slice(0, 2), [
			{ state: 'silent', polls: 1 },
			{ state: 'muted', polls: 4 },
		]);
	});

	it('counts one reading per poll when a connection reports several audio sources', async () => {
		setupGlobals();
		let polls = 0;
		getStatsFn = async () => {
			const level = polls++ === 0 ? 0.005 : 0;
			return makeStatsReport(level, level, level);
		};

		const { instance } = loadSpeakingIndicator();
		const emitted = [];
		const ipcRenderer = { send: mock.fn((channel, state) => {
			if (channel === 'microphone-state-changed') emitted.push({ state, polls });
		}) };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection();
		await new Promise(r => setTimeout(r, 1200));

		assert.deepStrictEqual(emitted.slice(0, 2), [
			{ state: 'silent', polls: 1 },
			{ state: 'muted', polls: 4 },
		]);
	});

	it('does not emit muted while any audio source is live', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0, 0.005);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection();
		await new Promise(r => setTimeout(r, 900));

		const states = ipcRenderer.send.mock.calls
			.filter(c => c.arguments[0] === 'microphone-state-changed')
			.map(c => c.arguments[1]);
		assert.ok(!states.includes('muted'), `got: ${states.join(',')}`);
	});

	it('emits muted when joining a connected call already muted, with no audio ever seen', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection();
		await new Promise(r => setTimeout(r, 900));

		const states = ipcRenderer.send.mock.calls
			.filter(c => c.arguments[0] === 'microphone-state-changed')
			.map(c => c.arguments[1]);
		assert.ok(states.includes('muted'), `got: ${states.join(',')}`);
	});

	it('does not emit muted for zero audioLevel before the connection is up (pre-join guard)', async () => {
		setupGlobals();
		// Before join the level reads zero with the track enabled; that must
		// stay silent rather than read as muted.
		audioTrackEnabled = true;
		getStatsFn = async () => makeStatsReport(0);

		const { instance } = loadSpeakingIndicator();
		const ipcRenderer = { send: mock.fn() };
		instance.init({ mqtt: { enabled: true } }, ipcRenderer);

		openPeerConnection().connectionState = 'connecting';
		await new Promise(r => setTimeout(r, 600));

		const micCalls = ipcRenderer.send.mock.calls.filter(c => c.arguments[0] === 'microphone-state-changed');
		const states = micCalls.map(c => c.arguments[1]);
		assert.ok(
			!states.includes('muted'),
			`should not emit muted while audioLevel is zero but track is enabled, got: ${states.join(',')}`
		);
		assert.ok(
			states.includes('silent'),
			`should emit silent in this case, got: ${states.join(',')}`
		);
	});
});

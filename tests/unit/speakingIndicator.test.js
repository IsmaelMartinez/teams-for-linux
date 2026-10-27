'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const speakingIndicatorPath = require.resolve('../../app/browser/tools/speakingIndicator');
const activityHubPath = require.resolve('../../app/browser/tools/activityHub');

// Each stat names its track, as Chromium's trackIdentifier does. No levels
// means no media-source stat, as when the sender has no track.
function makeTrackStatsReport(audioLevel, trackIds) {
	return makeTrackLevelsReport(trackIds.map(trackId => [trackId, audioLevel]));
}

// [[trackId, audioLevel], ...] in report order.
function makeTrackLevelsReport(levelsByTrack) {
	const entries = levelsByTrack.map(([trackIdentifier, audioLevel]) => ({ type: 'media-source', kind: 'audio', audioLevel, trackIdentifier }));
	return { forEach: (fn) => entries.forEach(entry => fn(entry)) };
}

function makeStatsReport(...audioLevels) {
	const entries = audioLevels.map(audioLevel => ({ type: 'media-source', kind: 'audio', audioLevel, trackIdentifier: 'mic' }));
	return { forEach: (fn) => entries.forEach(entry => fn(entry)) };
}

// A healthy, unmuted outgoing audio m-line; tests change one field at a time.
function makeAudioTransceiver(trackId = 'mic') {
	const sender = {
		track: { id: trackId, kind: 'audio', enabled: true, muted: false, readyState: 'live' },
		encodings: [{ active: true }],
		getParameters() { return { encodings: this.encodings }; },
	};
	return {
		direction: 'sendrecv',
		currentDirection: 'sendrecv',
		sender,
		receiver: { track: { kind: 'audio' } },
	};
}

let createdPeerConnections = [];
let getStatsFn = async () => makeStatsReport(0);
let audioTransceiver = makeAudioTransceiver();
let transceivers = [audioTransceiver];

function setupGlobals() {
	createdPeerConnections = [];
	audioTransceiver = makeAudioTransceiver();
	transceivers = [audioTransceiver];
	const originalRTC = function RTCPeerConnection() {
		this.connectionState = 'connected';
		this.getStats = (...args) => getStatsFn.call(this, ...args);
		this.getTransceivers = () => transceivers;
		this.getSenders = () => transceivers.map(t => t.sender);
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

// Runs one MQTT-only session where levelsForPoll(n) gives the audio level(s)
// of poll n, and returns each microphone state emitted with the poll count.
async function recordMicStates(levelsForPoll, { waitMs = 1200, connectionState } = {}) {
	setupGlobals();
	let polls = 0;
	getStatsFn = async () => makeStatsReport(...[levelsForPoll(polls++)].flat());

	const { instance } = loadSpeakingIndicator();
	const emitted = [];
	instance.init({ mqtt: { enabled: true } }, {
		send: (channel, state) => {
			if (channel === 'microphone-state-changed') emitted.push({ state, polls });
		},
	});

	const pc = openPeerConnection();
	if (connectionState) pc.connectionState = connectionState;
	await new Promise(r => setTimeout(r, waitMs));
	return emitted;
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
	audioTransceiver = makeAudioTransceiver();
	transceivers = [audioTransceiver];
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Starts MQTT-mode monitoring on one connection and returns the IPC spy.
function startMonitoring() {
	const { instance } = loadSpeakingIndicator();
	const ipcRenderer = { send: mock.fn() };
	instance.init({ mqtt: { enabled: true } }, ipcRenderer);
	openPeerConnection();
	return ipcRenderer;
}

function micStates(ipcRenderer) {
	return ipcRenderer.send.mock.calls
		.filter(c => c.arguments[0] === 'microphone-state-changed')
		.map(c => c.arguments[1]);
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
		audioTransceiver.sender.track.enabled = false;
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

	const ZERO_AFTER_FIRST_POLL = poll => (poll === 0 ? 0.005 : 0);

	it('emits muted when audioLevel drops to zero after audio was seen, with the track still enabled (#3099)', async () => {
		// Teams zeroes the level on mute but leaves the track enabled.
		const states = (await recordMicStates(poll => (poll < 2 ? 0.005 : 0))).map(e => e.state);
		assert.deepStrictEqual(states, ['silent', 'muted']);
	});

	it('does not emit muted when single zero ticks interleave with a quiet noise floor (#2465 hysteresis)', async () => {
		const states = (await recordMicStates(poll => (poll % 2 === 0 ? 0.005 : 0))).map(e => e.state);
		assert.ok(!states.includes('muted'), `got: ${states.join(',')}`);
	});

	it('enters muted on the third consecutive zero poll, not the second (#2465 hysteresis boundary)', async () => {
		// Poll 1 is audio, polls 2 and 3 are zeros (still silent), poll 4 is the third zero.
		const emitted = await recordMicStates(ZERO_AFTER_FIRST_POLL);
		assert.deepStrictEqual(emitted.slice(0, 2), [
			{ state: 'silent', polls: 1 },
			{ state: 'muted', polls: 4 },
		]);
	});

	it('counts one reading per poll when a connection reports several audio sources', async () => {
		const emitted = await recordMicStates(poll => Array(3).fill(ZERO_AFTER_FIRST_POLL(poll)));
		assert.deepStrictEqual(emitted.slice(0, 2), [
			{ state: 'silent', polls: 1 },
			{ state: 'muted', polls: 4 },
		]);
	});

	it('does not emit muted while any audio source is live', async () => {
		const states = (await recordMicStates(() => [0, 0.005])).map(e => e.state);
		assert.ok(!states.includes('muted'), `got: ${states.join(',')}`);
	});

	it('emits muted when joining a connected call already muted, with no audio ever seen', async () => {
		const states = (await recordMicStates(() => 0)).map(e => e.state);
		assert.ok(states.includes('muted'), `got: ${states.join(',')}`);
	});

	it('does not emit muted for zero audioLevel before the connection is up (pre-join guard)', async () => {
		const states = (await recordMicStates(() => 0, { connectionState: 'connecting' })).map(e => e.state);
		assert.ok(!states.includes('muted'), `got: ${states.join(',')}`);
		assert.ok(states.includes('silent'), `got: ${states.join(',')}`);
	});

	// Each sender-side signal is enough on its own, at once and even while
	// audio flows, without waiting for the audio-level hysteresis.
	const muteSignals = [
		['track.muted is true', () => { audioTransceiver.sender.track.muted = true; }],
		["track.readyState is 'ended'", () => { audioTransceiver.sender.track.readyState = 'ended'; }],
		['every encoding is inactive', () => { audioTransceiver.sender.encodings = [{ active: false }]; }],
		["currentDirection is 'recvonly'", () => { audioTransceiver.currentDirection = 'recvonly'; }],
		["currentDirection is 'inactive'", () => { audioTransceiver.currentDirection = 'inactive'; }],
	];
	for (const [signal, apply] of muteSignals) {
		it(`emits muted when ${signal} (#3099)`, async () => {
			setupGlobals();
			apply();
			getStatsFn = async () => makeStatsReport(0.05);

			const ipcRenderer = startMonitoring();
			await wait(300);

			assert.deepStrictEqual(micStates(ipcRenderer), ['muted']);
		});
	}

	it('emits speaking while every sender signal is healthy and negotiation is pending (#3099)', async () => {
		setupGlobals();
		audioTransceiver.currentDirection = null;
		getStatsFn = async () => makeStatsReport(0.05);

		const ipcRenderer = startMonitoring();
		await wait(300);

		assert.deepStrictEqual(micStates(ipcRenderer), ['speaking']);
	});

	it('does not emit muted for a direction change that is not negotiated yet (#3099)', async () => {
		setupGlobals();
		// direction is only what the next offer asks for; audio still goes out.
		audioTransceiver.direction = 'recvonly';
		getStatsFn = async () => makeStatsReport(0.05);

		const ipcRenderer = startMonitoring();
		await wait(300);

		assert.deepStrictEqual(micStates(ipcRenderer), ['speaking']);
	});

	// An idle transceiver that kept its track also reports a media-source; the
	// live microphone must win whichever order either list puts them in.
	for (const transceiverOrder of ['idle first', 'live first']) {
		for (const statOrder of ['idle first', 'live first']) {
			it(`judges the live microphone over an idle sender (transceivers ${transceiverOrder}, stats ${statOrder}) (#3099)`, async () => {
				setupGlobals();
				const idle = makeAudioTransceiver('old-mic');
				idle.direction = 'inactive';
				idle.currentDirection = 'inactive';
				transceivers = transceiverOrder === 'idle first' ? [idle, audioTransceiver] : [audioTransceiver, idle];
				const trackIds = statOrder === 'idle first' ? ['old-mic', 'mic'] : ['mic', 'old-mic'];
				getStatsFn = async () => makeTrackStatsReport(0.05, trackIds);

				const ipcRenderer = startMonitoring();
				await wait(300);

				assert.deepStrictEqual(micStates(ipcRenderer), ['speaking']);
			});
		}
	}

	for (const statOrder of ['idle first', 'live first']) {
		it(`emits muted when the live mic is zero while an idle sender still reports audio (stats ${statOrder}) (#3099)`, async () => {
			setupGlobals();
			const idle = makeAudioTransceiver('old-mic');
			idle.direction = 'inactive';
			idle.currentDirection = 'inactive';
			transceivers = [idle, audioTransceiver];
			const levels = [['old-mic', 0.05], ['mic', 0]];
			getStatsFn = async () => makeTrackLevelsReport(statOrder === 'idle first' ? levels : levels.reverse());

			const ipcRenderer = startMonitoring();
			await wait(900);

			assert.deepStrictEqual(micStates(ipcRenderer), ['silent', 'muted']);
		});
	}

	it('applies the pre-join guard again when a replacement connection takes over (#3099)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const ipcRenderer = startMonitoring();
		await wait(300);

		// The established peer closes and a still-connecting one replaces it
		// before the next poll, with no call-disconnected in between.
		getStatsFn = async () => makeStatsReport(0);
		closePeerConnections();
		openPeerConnection().connectionState = 'connecting';
		await wait(900);

		assert.ok(!micStates(ipcRenderer).includes('muted'), `got: ${micStates(ipcRenderer).join(',')}`);
	});

	it('judges the sending transceiver when an idle one kept the same track (#3099)', async () => {
		setupGlobals();
		const idle = makeAudioTransceiver('mic');
		idle.direction = 'inactive';
		idle.currentDirection = 'inactive';
		transceivers = [idle, audioTransceiver];
		getStatsFn = async () => makeStatsReport(0.05);

		const ipcRenderer = startMonitoring();
		await wait(300);

		assert.deepStrictEqual(micStates(ipcRenderer), ['speaking']);
	});

	for (const statOrder of ['stale first', 'live first']) {
		it(`judges a live replacement sender over a stale source (${statOrder}) (#3099)`, async () => {
			setupGlobals();
			getStatsFn = async () => makeStatsReport(0.05);

			const ipcRenderer = startMonitoring();
			await wait(300);

			// The remembered sender lost its track and a new sender took over,
			// while the report still lists the old track's source.
			audioTransceiver.sender.track = null;
			transceivers = [audioTransceiver, makeAudioTransceiver('mic-2')];
			const trackIds = statOrder === 'stale first' ? ['mic', 'mic-2'] : ['mic-2', 'mic'];
			getStatsFn = async () => makeTrackStatsReport(0.05, trackIds);
			await wait(300);

			assert.deepStrictEqual(micStates(ipcRenderer), ['speaking']);
		});
	}

	it('emits muted when a report taken before the detach still names the old track (#3099)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const ipcRenderer = startMonitoring();
		await wait(300);

		// The first report after the detach is stale, then the stat is gone.
		audioTransceiver.sender.track = null;
		let stale = true;
		getStatsFn = async () => {
			const report = stale ? makeStatsReport(0.05) : makeStatsReport();
			stale = false;
			return report;
		};
		await wait(450);

		assert.deepStrictEqual(micStates(ipcRenderer), ['speaking', 'muted']);
	});

	it('emits muted when the audio track is detached and its stat disappears, then off on close (#3099)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0.05);

		const ipcRenderer = startMonitoring();
		await wait(300);

		// replaceTrack(null): the sender keeps its m-line but no media-source
		// stat is reported any more.
		audioTransceiver.sender.track = null;
		getStatsFn = async () => makeStatsReport();
		await wait(300);

		closePeerConnections();
		await wait(300);

		assert.deepStrictEqual(micStates(ipcRenderer), ['speaking', 'muted', 'off']);
	});

	it('does not report muted for a connection that never carried audio (#3099)', async () => {
		setupGlobals();
		audioTransceiver.sender.track = null;
		audioTransceiver.direction = 'recvonly';
		getStatsFn = async () => makeStatsReport();

		const ipcRenderer = startMonitoring();
		await wait(300);

		assert.deepStrictEqual(micStates(ipcRenderer), []);
	});

	it('logs mute signals once per change, not on every poll (#3099)', async () => {
		setupGlobals();
		getStatsFn = async () => makeStatsReport(0);
		const debug = mock.method(console, 'debug', () => {});
		const signalLines = () => debug.mock.calls
			.map(c => String(c.arguments[0]))
			.filter(line => line.startsWith('[SPEAKING_INDICATOR] Mute signals'));

		try {
			startMonitoring();
			await wait(500);
			assert.strictEqual(signalLines().length, 1, 'steady signals should log once');

			audioTransceiver.sender.track.muted = true;
			await wait(300);
			const lines = signalLines();
			assert.strictEqual(lines.length, 2, 'a changed signal should log one more line');
			assert.match(lines[1], /"muted":true/);
		} finally {
			debug.mock.restore();
		}
	});
});

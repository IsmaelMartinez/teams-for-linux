'use strict';

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

// Path to the module under test and its dependency
const speakingIndicatorPath = require.resolve('../../app/browser/tools/speakingIndicator');
const activityHubPath = require.resolve('../../app/browser/tools/activityHub');

function createMockAudioContext() {
	return {
		createAnalyser: () => ({
			fftSize: 0,
			smoothingTimeConstant: 0,
			frequencyBinCount: 128,
			getByteFrequencyData: mock.fn(),
		}),
		createMediaStreamSource: () => ({
			connect: mock.fn(),
			disconnect: mock.fn(),
		}),
		close: mock.fn(),
	};
}

function setupGlobals(getUserMediaImpl) {
	const originalGetUserMedia = getUserMediaImpl || mock.fn(async () => ({ getAudioTracks: () => [] }));
	global.navigator = {
		mediaDevices: {
			getUserMedia: originalGetUserMedia,
		},
	};
	// Use a real constructor function so `new AudioContext()` works
	global.AudioContext = function AudioContext() {
		return createMockAudioContext();
	};
	global.document = {
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
	return originalGetUserMedia;
}

function loadSpeakingIndicator() {
	// Inject mock activityHub into require cache before loading
	const mockActivityHub = { on: mock.fn(), off: mock.fn() };
	require.cache[activityHubPath] = {
		id: activityHubPath,
		exports: mockActivityHub,
		loaded: true,
	};
	// Clear speakingIndicator from cache so we get a fresh singleton
	delete require.cache[speakingIndicatorPath];
	const instance = require(speakingIndicatorPath);
	return { instance, mockActivityHub };
}

function cleanup() {
	delete require.cache[speakingIndicatorPath];
	delete require.cache[activityHubPath];
	delete global.navigator;
	delete global.AudioContext;
	delete global.document;
}

describe('SpeakingIndicator', () => {
	beforeEach(() => {
		cleanup();
	});

	it('does not patch getUserMedia when disabled', () => {
		const originalGetUserMedia = setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = global.navigator.mediaDevices.getUserMedia;

		instance.init({ media: { microphone: { speakingIndicator: false } } });

		assert.strictEqual(
			global.navigator.mediaDevices.getUserMedia,
			refBefore,
			'getUserMedia should remain unchanged when speakingIndicator is disabled'
		);
		cleanup();
	});

	it('patches getUserMedia when enabled', () => {
		const originalGetUserMedia = setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = global.navigator.mediaDevices.getUserMedia;
		const mockIpcRenderer = { send: mock.fn() };

		instance.init(
			{ media: { microphone: { speakingIndicator: true } } },
			mockIpcRenderer,
		);

		assert.notStrictEqual(
			global.navigator.mediaDevices.getUserMedia,
			refBefore,
			'getUserMedia should be replaced when speakingIndicator is enabled'
		);
		cleanup();
	});

	it('sends microphone-state-changed IPC with boolean enabled value', async () => {
		// Set up a track whose enabled property we can toggle
		let trackEnabled = true;
		const mockTrack = {
			get enabled() { return trackEnabled; },
			addEventListener: mock.fn(),
		};
		const mockStream = {
			getAudioTracks: () => [mockTrack],
		};

		// Set up globals with getUserMedia returning our mock stream BEFORE init
		setupGlobals(mock.fn(async () => mockStream));
		const { instance, mockActivityHub } = loadSpeakingIndicator();
		const mockIpcRenderer = { send: mock.fn() };

		instance.init(
			{ media: { microphone: { speakingIndicator: true } } },
			mockIpcRenderer,
		);

		// Retrieve the patched getUserMedia (init wraps our mock)
		const patchedGetUserMedia = global.navigator.mediaDevices.getUserMedia;

		// Simulate activityHub emitting call-connected
		const callConnectedHandler = mockActivityHub.on.mock.calls
			.find(call => call.arguments[0] === 'call-connected');
		assert.ok(callConnectedHandler, 'should register call-connected handler');
		callConnectedHandler.arguments[1](); // fire call-connected

		// Trigger patched getUserMedia with audio so onAudioStreamAcquired fires
		await patchedGetUserMedia({ audio: true });

		// Now mute polling is active. Toggle track.enabled to simulate mute.
		trackEnabled = false;

		// Wait for the mute poll interval to fire (200ms + buffer)
		await new Promise(resolve => setTimeout(resolve, 350));

		// Verify IPC was called with channel and boolean value
		const sendCalls = mockIpcRenderer.send.mock.calls;
		const micStateCall = sendCalls.find(
			call => call.arguments[0] === 'microphone-state-changed'
		);
		assert.ok(micStateCall, 'should send microphone-state-changed IPC');
		assert.strictEqual(
			micStateCall.arguments[1],
			false,
			'should send boolean false (track.enabled) as the payload'
		);

		cleanup();
	});
});

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
		setupGlobals();
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
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = global.navigator.mediaDevices.getUserMedia;

		instance.init({ media: { microphone: { speakingIndicator: true } } });

		assert.notStrictEqual(
			global.navigator.mediaDevices.getUserMedia,
			refBefore,
			'getUserMedia should be replaced when speakingIndicator is enabled'
		);
		cleanup();
	});

	it('registers call lifecycle events on activityHub', () => {
		setupGlobals();
		const { instance, mockActivityHub } = loadSpeakingIndicator();

		instance.init({ media: { microphone: { speakingIndicator: true } } });

		const events = mockActivityHub.on.mock.calls.map(call => call.arguments[0]);
		assert.ok(events.includes('call-connected'), 'should register call-connected handler');
		assert.ok(events.includes('call-disconnected'), 'should register call-disconnected handler');
		cleanup();
	});

	it('starts audio analysis when getUserMedia is called during a call', async () => {
		const mockTrack = {
			enabled: true,
			addEventListener: mock.fn(),
		};
		const mockStream = {
			getAudioTracks: () => [mockTrack],
		};

		setupGlobals(mock.fn(async () => mockStream));
		const { instance, mockActivityHub } = loadSpeakingIndicator();

		instance.init({ media: { microphone: { speakingIndicator: true } } });

		// Simulate call-connected
		const callConnectedHandler = mockActivityHub.on.mock.calls
			.find(call => call.arguments[0] === 'call-connected');
		callConnectedHandler.arguments[1]();

		// Trigger getUserMedia so audio monitoring starts
		await global.navigator.mediaDevices.getUserMedia({ audio: true });

		// Verify the track's ended listener was registered
		const endedCall = mockTrack.addEventListener.mock.calls
			.find(call => call.arguments[0] === 'ended');
		assert.ok(endedCall, 'should register ended listener on audio track');

		cleanup();
	});
});

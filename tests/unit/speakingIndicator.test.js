'use strict';

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

const speakingIndicatorPath = require.resolve('../../app/browser/tools/speakingIndicator');
const activityHubPath = require.resolve('../../app/browser/tools/activityHub');

function makeStatsReport(audioLevel) {
	const entries = [
		{ type: 'media-source', kind: 'audio', audioLevel },
	];
	return { forEach: (fn) => entries.forEach(fn) };
}

function setupGlobals() {
	const originalRTC = function RTCPeerConnection() {
		this.connectionState = 'connected';
		this.getStats = mock.fn(async () => makeStatsReport(0));
	};
	originalRTC.prototype = {};
	global.window = {
		RTCPeerConnection: originalRTC,
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
	return originalRTC;
}

function loadSpeakingIndicator() {
	const mockActivityHub = { on: mock.fn(), off: mock.fn() };
	require.cache[activityHubPath] = {
		id: activityHubPath,
		exports: mockActivityHub,
		loaded: true,
	};
	delete require.cache[speakingIndicatorPath];
	const instance = require(speakingIndicatorPath);
	return { instance, mockActivityHub };
}

function cleanup() {
	delete require.cache[speakingIndicatorPath];
	delete require.cache[activityHubPath];
	delete global.window;
	delete global.document;
}

describe('SpeakingIndicator', () => {
	beforeEach(() => {
		cleanup();
	});

	it('does not patch RTCPeerConnection when disabled', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = global.window.RTCPeerConnection;

		instance.init({ media: { microphone: { speakingIndicator: false } } });

		assert.strictEqual(
			global.window.RTCPeerConnection,
			refBefore,
			'RTCPeerConnection should remain unchanged when speakingIndicator is disabled'
		);
		cleanup();
	});

	it('patches RTCPeerConnection when enabled', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		const refBefore = global.window.RTCPeerConnection;

		instance.init({ media: { microphone: { speakingIndicator: true } } });

		assert.notStrictEqual(
			global.window.RTCPeerConnection,
			refBefore,
			'RTCPeerConnection should be replaced when speakingIndicator is enabled'
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

	it('captures RTCPeerConnection instances when patched', () => {
		setupGlobals();
		const { instance } = loadSpeakingIndicator();
		instance.init({ media: { microphone: { speakingIndicator: true } } });

		// Creating a peer connection should be captured
		const pc = new global.window.RTCPeerConnection();
		assert.ok(pc, 'RTCPeerConnection should still be constructable after patching');
		cleanup();
	});

	it('shows overlay when audio stats are detected on a peer connection', async () => {
		const origRTC = setupGlobals();
		// Make getStats return a non-zero audioLevel so the overlay appears
		origRTC.prototype.getStats = async () => ({
			forEach: (fn) => fn({ type: 'media-source', kind: 'audio', audioLevel: 0.05 }),
		});

		const { instance } = loadSpeakingIndicator();
		instance.init({ media: { microphone: { speakingIndicator: true } } });

		// Create a peer connection — this starts polling
		new global.window.RTCPeerConnection();

		// Wait for one poll cycle
		await new Promise(r => setTimeout(r, 200));

		assert.ok(
			global.document.body.appendChild.mock.calls.length > 0,
			'overlay should appear when audio stats with non-zero audioLevel are detected'
		);
		cleanup();
	});
});

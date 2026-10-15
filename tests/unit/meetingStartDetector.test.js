'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

// The module exports a singleton whose DOM interaction only starts inside
// init(); requiring it in plain Node is safe. These tests cover the pure
// pattern logic (compilation, defaults, case-insensitivity, invalid input).
const detector = require('../../app/browser/tools/meetingStartDetector');

describe('MeetingStartDetector pattern compilation', () => {
	it('falls back to the built-in defaults when no patterns are configured', () => {
		for (const input of [undefined, null, []]) {
			const compiled = detector.compilePatterns(input);
			assert.strictEqual(compiled.length, 2);
			// Status-bar banner wording, verified live (#2587).
			assert.ok(compiled.some((p) => p.test('Meeting Started: AI Team - Sprint Planning')));
			// Person-initiated toast wording.
			assert.ok(compiled.some((p) => p.test('Jane Doe started the meeting')));
		}
	});

	it('compiles configured patterns case-insensitively', () => {
		const compiled = detector.compilePatterns(['hat die Besprechung gestartet']);
		assert.strictEqual(compiled.length, 1);
		assert.ok(compiled[0].test('Max Mustermann HAT DIE BESPRECHUNG GESTARTET'));
	});

	it('supports regular expression syntax in patterns', () => {
		const compiled = detector.compilePatterns(['(started|joined) the (meeting|call)']);
		assert.ok(compiled[0].test('Someone joined the call'));
		assert.ok(!compiled[0].test('Someone left the call'));
	});

	it('skips invalid regular expressions instead of throwing', () => {
		const compiled = detector.compilePatterns(['[unclosed', 'started the meeting']);
		assert.strictEqual(compiled.length, 1);
		assert.ok(compiled[0].test('x started the meeting'));
	});

	it('returns an empty list when every pattern is invalid', () => {
		const compiled = detector.compilePatterns(['[', '(']);
		assert.strictEqual(compiled.length, 0);
	});
});

describe('MeetingStartDetector.matchesPatterns', () => {
	it('rejects empty and non-string input without patterns loaded', () => {
		assert.strictEqual(detector.matchesPatterns(''), false);
		assert.strictEqual(detector.matchesPatterns(null), false);
		assert.strictEqual(detector.matchesPatterns(42), false);
	});
});

function withPlatform(platform, run) {
	const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
	Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
	try { run(); } finally { Object.defineProperty(process, 'platform', descriptor); }
}

function initDetector(platform, mqttEnabled, detectionEnabled, dbusEnabled = false) {
	const detectorPath = require.resolve('../../app/browser/tools/meetingStartDetector');
	const activityHubPath = require.resolve('../../app/browser/tools/activityHub');
	const originalHub = require.cache[activityHubPath];
	const hub = new EventEmitter();
	const domEvents = [];
	const oldDocument = globalThis.document;
	globalThis.document = {
		readyState: 'loading',
		addEventListener: (name, listener) => domEvents.push([name, listener]),
	};
	require.cache[activityHubPath] = { id: activityHubPath, exports: hub, loaded: true };
	delete require.cache[detectorPath];
	const detector = require(detectorPath);
	withPlatform(platform, () => detector.init({
		mqtt: { enabled: mqttEnabled, meetingStartDetection: { enabled: detectionEnabled } },
		dbusControl: { enabled: dbusEnabled },
	}, { send() {} }));
	const result = { detector, hub, domEvents };
	delete require.cache[detectorPath];
	if (originalHub) require.cache[activityHubPath] = originalHub;
	else delete require.cache[activityHubPath];
	if (oldDocument === undefined) delete globalThis.document;
	else globalThis.document = oldDocument;
	return result;
}

describe('MeetingStartDetector transport enablement', () => {
	it('starts on Linux when meeting detection is enabled and MQTT is disabled', () => {
		const { hub, domEvents } = initDetector('linux', false, true, true);
		assert.equal(hub.listenerCount('meeting-started'), 1);
		assert.equal(domEvents[0][0], 'DOMContentLoaded');
	});

	it('keeps the detection config gate and non-Linux MQTT gate', () => {
		assert.equal(initDetector('linux', false, false, true).hub.listenerCount('meeting-started'), 0);
		assert.equal(initDetector('linux', false, true).hub.listenerCount('meeting-started'), 0);
		assert.equal(initDetector('darwin', false, true, true).hub.listenerCount('meeting-started'), 0);
		assert.equal(initDetector('darwin', true, true).hub.listenerCount('meeting-started'), 1);
	});
});

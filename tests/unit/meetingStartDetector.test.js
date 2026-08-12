'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

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

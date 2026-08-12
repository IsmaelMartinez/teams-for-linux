'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');

// CLAUDE.md requires temporary debug instrumentation to be marked
// "DEBUG-ONLY: Remove before merge" and stripped before it reaches main. That
// convention only works if something enforces it: the #2587 meeting-start
// sampler carried the marker and still shipped in v2.15.0, logging toast text
// that contains colleagues' names. This guard fails the build instead.
const APP_DIR = path.join(__dirname, '..', '..', 'app');
const MARKER = 'DEBUG-ONLY';

function collectSourceFiles(dir) {
	const found = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			found.push(...collectSourceFiles(full));
		} else if (/\.(js|mjs|html)$/.test(entry)) {
			found.push(full);
		}
	}
	return found;
}

// Logging a serialised DOM subtree is the highest-yield way to leak PII by
// accident: one line dumps every name, message preview and meeting title on the
// page. activityManager logged document.body.innerHTML on every incoming call
// until this guard was added. Single-line check only, so a console call split
// across lines still slips through; it catches the shape the mistake takes.
const CONSOLE_CALL = /console\.(debug|info|warn|error|log)\(/;
const SERIALISED_DOM = /(inner|outer)HTML/;

describe('debug-only instrumentation', () => {
	it('is not present anywhere under app/', () => {
		const offenders = [];
		for (const file of collectSourceFiles(APP_DIR)) {
			const lines = readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, index) => {
				if (line.includes(MARKER)) {
					offenders.push(`${path.relative(APP_DIR, file)}:${index + 1}`);
				}
			});
		}
		assert.deepStrictEqual(
			offenders,
			[],
			`Debug-only instrumentation must be removed before merge. Found at:\n  ${offenders.join('\n  ')}`
		);
	});

	it('does not log serialised DOM anywhere under app/', () => {
		const offenders = [];
		for (const file of collectSourceFiles(APP_DIR)) {
			const lines = readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, index) => {
				if (CONSOLE_CALL.test(line) && SERIALISED_DOM.test(line)) {
					offenders.push(`${path.relative(APP_DIR, file)}:${index + 1}`);
				}
			});
		}
		assert.deepStrictEqual(
			offenders,
			[],
			`Serialised DOM must not be logged, it carries message text and names. Found at:\n  ${offenders.join('\n  ')}`
		);
	});
});

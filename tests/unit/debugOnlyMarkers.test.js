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
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { AppConfiguration } = require('../../app/appConfiguration');

// Guards against the #2860 class of bug. AppConfiguration keeps the parsed
// config behind a `startupConfig` getter, with the state in module-level
// WeakMaps and no proxy or property forwarding. Reading a config option
// straight off the instance (`configGroup.clearStorageData`) is therefore not
// a type error; it silently yields undefined, so the branch guarding on it
// never runs. That shipped unnoticed from #1627 until the ADR-025 rename work.
//
// The allowed set comes from the class itself, so adding a getter or a method
// needs no edit here.

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const ALLOWED = new Set(
	Object.getOwnPropertyNames(AppConfiguration.prototype).filter((n) => n !== 'constructor')
);

function* jsFiles(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* jsFiles(full);
		else if (entry.name.endsWith('.js')) yield full;
	}
}

describe('AppConfiguration access', () => {
	it('keeps the parsed config behind startupConfig, not on the instance', () => {
		assert.ok(ALLOWED.has('startupConfig'), 'startupConfig accessor went missing');
		assert.ok(!ALLOWED.has('clearStorageData'), 'config options must not be instance members');
	});

	// Matches the two names an AppConfiguration is bound to across the codebase.
	// Deliberately literal: it cannot see an instance stored under some other
	// name, so it is a backstop for the common shape rather than a proof.
	it('no source file reads a config option straight off an AppConfiguration', () => {
		const offenders = [];

		for (const file of jsFiles(APP_DIR)) {
			const lines = fs.readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, index) => {
				// Digits belong in the identifier class: without them a member such
				// as `oauth2Config` would truncate to `oauth` and misreport.
				for (const match of line.matchAll(/\b(?:configGroup|appConfig)\??\.([\w$]+)/g)) {
					if (!ALLOWED.has(match[1])) {
						offenders.push(
							`${path.relative(APP_DIR, file)}:${index + 1} reads .${match[1]}, ` +
								`use .startupConfig.${match[1]}`
						);
					}
				}
			});
		}

		assert.deepStrictEqual(offenders, [], `\n  ${offenders.join('\n  ')}\n`);
	});
});

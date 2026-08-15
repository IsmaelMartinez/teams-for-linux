'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Guards against the #2860 class of bug. AppConfiguration keeps the parsed
// config behind a `startupConfig` getter, with the state in module-level
// WeakMaps and no proxy or property forwarding. So reading a config option
// straight off the instance (`configGroup.clearStorageData`) is not a type
// error, it just silently yields undefined, and the branch guarding on it
// never runs. That shipped unnoticed from #1627 until the ADR-025 rename work.
//
// The allowed set is derived from the class itself so adding a getter does not
// require editing this test.

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const CONFIG_CLASS = path.join(APP_DIR, 'appConfiguration', 'index.js');

function declaredGetters() {
	const source = fs.readFileSync(CONFIG_CLASS, 'utf8');
	return new Set([...source.matchAll(/^\s*get ([a-zA-Z]+)\(\)/gm)].map((m) => m[1]));
}

function* jsFiles(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* jsFiles(full);
		else if (entry.name.endsWith('.js')) yield full;
	}
}

describe('AppConfiguration access', () => {
	it('exposes getters, so the config is not readable off the instance', () => {
		const getters = declaredGetters();
		assert.ok(getters.has('startupConfig'), 'startupConfig getter went missing');
		assert.ok(getters.size >= 4, 'expected at least four getters');
	});

	it('no source file reads a config option straight off an AppConfiguration', () => {
		const allowed = declaredGetters();
		const offenders = [];

		for (const file of jsFiles(APP_DIR)) {
			const lines = fs.readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, index) => {
				for (const match of line.matchAll(/\b(?:configGroup|appConfig)\.([a-zA-Z_]+)/g)) {
					if (!allowed.has(match[1])) {
						offenders.push(
							`${path.relative(APP_DIR, file)}:${index + 1} reads .${match[1]}`
						);
					}
				}
			});
		}

		assert.deepStrictEqual(
			offenders,
			[],
			`Read the option through .startupConfig instead:\n  ${offenders.join('\n  ')}`
		);
	});
});

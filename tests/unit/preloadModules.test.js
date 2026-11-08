'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for issue #1902 and the AGENTS.md "Modules Requiring IPC
// Initialization" rule. The `ipc: true` flag on a `modules` entry in
// `app/browser/preload.js` controls which browser-side modules receive
// `ipcRenderer` during `init` (a per-entry flag rather than a Set, because
// page script can patch Set.prototype.has; GHSA-58j7-22f8-6xqp). Dropping
// the flag from `trayIconRenderer` or `mqttStatusMonitor` is a silent regression --- the modules
// load fine, then crash later inside their handlers with
// `TypeError: Cannot read properties of undefined (reading 'send')`.
// AGENTS.md notes the fix has been "accidentally removed multiple times
// in git history".
//
// `preload.js` is an Electron preload script that can't be `require`d in
// a plain Node test without stubbing the `electron` runtime. Parsing it
// as text keeps the test fast, deterministic, and free of mocks.

const PRELOAD_PATH = join(__dirname, '..', '..', 'app', 'browser', 'preload.js');
const REQUIRED_MODULES = ['settings', 'theme', 'trayIconRenderer', 'mqttStatusMonitor', 'meetingStartDetector', 'webauthnOverride'];

describe('preload.js modules passing ipcRenderer', () => {
	const source = readFileSync(PRELOAD_PATH, 'utf8');

	for (const name of REQUIRED_MODULES) {
		it(`flags "${name}" with ipc: true`, () => {
			const entry = new RegExp(`\\{\\s*name:\\s*"${name}",\\s*path:\\s*"[^"]+",\\s*ipc:\\s*true\\s*\\}`);
			assert.match(
				source,
				entry,
				`"${name}" lost \`ipc: true\` in the modules list in app/browser/preload.js. ` +
					'This module needs `ipcRenderer` during init or its IPC calls throw silently. ' +
					'See AGENTS.md "Modules Requiring IPC Initialization" and issue #1902.'
			);
		});
	}

	it('sets ipc on every entry, so none falls through to Object.prototype', () => {
		const list = source.slice(source.indexOf('const modules = ['));
		const entries = list.slice(0, list.indexOf('];')).match(/\{[^}]*\}/g) || [];
		assert.ok(entries.length > 10, 'could not find the modules list');
		for (const entry of entries) {
			assert.match(entry, /ipc:\s*(true|false)\s*\}$/, `${entry} has no own ipc flag`);
		}
	});

	it('hands ipcRenderer only to flagged modules, through an indexed loop', () => {
		assert.match(source, /if \(module\.ipc === true\) \{\s*moduleInstance\.init\(config, ipcRenderer\);/);
		assert.match(source, /for \(let i = 0; i < modules\.length; i\+\+\)/);
		assert.doesNotMatch(source, /for \(const module of modules\)/);
	});
});

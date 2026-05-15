'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for issue #1902 and the CLAUDE.md "Modules Requiring IPC
// Initialization" rule. The `modulesRequiringIpc` Set in
// `app/browser/preload.js` controls which browser-side modules receive
// `ipcRenderer` during `init`. Dropping `trayIconRenderer` or
// `mqttStatusMonitor` from this Set is a silent regression --- the modules
// load fine, then crash later inside their handlers with
// `TypeError: Cannot read properties of undefined (reading 'send')`.
// CLAUDE.md notes the fix has been "accidentally removed multiple times
// in git history".
//
// `preload.js` is an Electron preload script that can't be `require`d in
// a plain Node test without stubbing the `electron` runtime. Parsing it
// as text keeps the test fast, deterministic, and free of mocks --- the
// Set declaration is a stable invariant the rule depends on.

const PRELOAD_PATH = join(__dirname, '..', '..', 'app', 'browser', 'preload.js');
const REQUIRED_MODULES = ['settings', 'theme', 'trayIconRenderer', 'mqttStatusMonitor', 'webauthnOverride'];

describe('preload.js modulesRequiringIpc Set', () => {
	const source = readFileSync(PRELOAD_PATH, 'utf8');

	// Match: const modulesRequiringIpc = new Set([ "a", "b", ... ]);
	// across whitespace and either single or double quotes, but require the
	// `new Set` form so a future refactor to an array (or different name)
	// fails the test loudly rather than silently passing.
	const match = source.match(
		/const\s+modulesRequiringIpc\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/
	);

	it('is declared as a new Set([...]) literal', () => {
		assert.ok(
			match,
			'Could not find `const modulesRequiringIpc = new Set([...])` in app/browser/preload.js. ' +
				'If the declaration was refactored, update this test --- the Set membership rule ' +
				'(CLAUDE.md, issue #1902) still applies.'
		);
	});

	const declaredNames = match
		? match[1]
			.split(',')
			.map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
			.filter(Boolean)
		: [];

	for (const name of REQUIRED_MODULES) {
		it(`includes "${name}"`, () => {
			assert.ok(
				declaredNames.includes(name),
				`"${name}" missing from \`modulesRequiringIpc\` in app/browser/preload.js. ` +
					'This module needs `ipcRenderer` during init or its IPC calls throw silently. ' +
					'See CLAUDE.md "Modules Requiring IPC Initialization" and issue #1902.'
			);
		});
	}
});

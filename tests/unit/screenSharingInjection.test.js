'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for #2979: the injected screen-sharing script (audio
// stripping, preview relay) only ever reached the root window, so a share
// from a second multi-account profile ran with Teams' raw constraints.
// Source-text assertion because app/mainAppWindow/index.js requires the
// electron runtime; the profile-view side is behaviour-tested in
// profileViewManager.test.js.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');

describe('screen-sharing script injection target (#2979)', () => {
	const source = readFileSync(INDEX_PATH, 'utf8');

	it('injects into the webContents it is given, not the root window', () => {
		const fn = source.match(
			/function injectScreenSharingLogic\((\w+)\)\s*\{([\s\S]*?)\n\}/,
		);
		assert.ok(fn, 'injectScreenSharingLogic must take a target webContents');
		const [, param, body] = fn;
		assert.match(
			body,
			new RegExp(`${param}\\.executeJavaScript\\(script\\)`),
			'the script must run on the given webContents',
		);
		assert.doesNotMatch(
			body,
			/window\.webContents/,
			'must not fall back to the root window inside the injector',
		);
	});

	it('still injects into the root window on its did-finish-load', () => {
		assert.match(source, /injectScreenSharingLogic\(window\.webContents\)/);
	});

	it('is exported so ProfileViewManager can inject into profile views', () => {
		assert.match(
			source,
			/exports\.injectScreenSharingLogic\s*=\s*injectScreenSharingLogic/,
		);
	});
});

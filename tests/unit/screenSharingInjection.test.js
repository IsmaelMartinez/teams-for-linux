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

// Second half of #2979: the preview relay port was posted to the root window
// regardless of which renderer started the share, so a second-profile share
// opened a preview with no frame source and painted black.
describe('screen-share preview port routing (#2979)', () => {
	const source = readFileSync(INDEX_PATH, 'utf8');
	const handler = source.match(
		/ipcMain\.on\("screen-sharing-started",\s*\((\w*)\)\s*=>\s*\{([\s\S]*?)\n {2}\}\);/,
	);

	it('posts the relay port to the renderer that started the share', () => {
		assert.ok(handler, 'screen-sharing-started handler must exist');
		const [, eventParam, body] = handler;
		assert.ok(eventParam, 'handler must take the IPC event to reach its sender');
		assert.match(
			body,
			new RegExp(`${eventParam}\\.sender`),
			'handler must read the sender off the IPC event',
		);
		assert.match(
			body,
			new RegExp(`(?:${eventParam}\\.)?sender\\.postMessage\\("screen-share-port", null, \\[port1\\]\\)`),
			'port1 must go to the sending webContents',
		);
		assert.doesNotMatch(
			body,
			/window\.webContents\.postMessage\("screen-share-port"/,
			'port1 must not be routed to the root window',
		);
	});
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { installWebviewGuard } = require('../../app/security/webviewGuard');

const silent = { warn() {} };

function attach(contents) {
	let prevented = false;
	const event = { preventDefault: () => { prevented = true; } };
	const webPreferences = { preload: '/tmp/planted.png', sandbox: false };
	contents.emit('will-attach-webview', event, webPreferences, { src: 'https://example.com' });
	return prevented;
}

describe('installWebviewGuard (GHSA-6xpg-fhf9-chcr)', () => {
	it('blocks a webview attach on any webContents created after install', () => {
		const app = new EventEmitter();
		installWebviewGuard(app, silent);
		const first = new EventEmitter();
		const second = new EventEmitter();
		app.emit('web-contents-created', {}, first);
		app.emit('web-contents-created', {}, second);
		assert.strictEqual(attach(first), true);
		assert.strictEqual(attach(second), true);
	});

	it('is installed at startup', () => {
		const source = readFileSync(join(__dirname, '..', '..', 'app', 'index.js'), 'utf8');
		assert.match(source, /installWebviewGuard\(app\)/);
	});
});

describe('webviewTag stays disabled', () => {
	for (const file of ['browserWindowManager.js', 'profileViewManager.js']) {
		it(`is false in ${file}`, () => {
			const source = readFileSync(join(__dirname, '..', '..', 'app', 'mainAppWindow', file), 'utf8');
			assert.match(source, /webviewTag:\s*false/);
			assert.doesNotMatch(source, /webviewTag:\s*true/);
		});
	}
});

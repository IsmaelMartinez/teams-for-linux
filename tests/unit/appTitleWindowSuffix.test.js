'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// Regression guard for #3035: a custom app.title replaces the trailing
// "Microsoft Teams" in the window title, while the default leaves Electron
// mirroring document.title. app/mainAppWindow/index.js requires the electron
// runtime, so the handler is extracted from source and run against stubs.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');
const source = readFileSync(INDEX_PATH, 'utf8');
const handlerSource = source.match(/function onPageTitleUpdated\(event, title\) \{[\s\S]*?\n\}/)?.[0];

function run(appTitle, title) {
	const calls = { sent: [], setTitle: [], prevented: 0 };
	const window = {
		webContents: { send: (channel, value) => calls.sent.push([channel, value]) },
		setTitle: (value) => calls.setTitle.push(value),
	};
	const handler = vm.runInNewContext(`(${handlerSource})`, { window, config: { appTitle } });
	handler({ preventDefault: () => calls.prevented++ }, title);
	return calls;
}

describe('onPageTitleUpdated app.title', () => {
	it('exists', () => {
		assert.ok(handlerSource, 'onPageTitleUpdated(event, title) not found');
	});

	it('replaces the trailing Microsoft Teams with a custom app.title', () => {
		const calls = run('Teams - Org A', 'Chat | Microsoft Teams');
		assert.deepStrictEqual(calls.setTitle, ['Chat | Teams - Org A']);
		assert.strictEqual(calls.prevented, 1);
	});

	it('appends a custom app.title when the page title lacks the default', () => {
		const calls = run('Work', 'Connecting');
		assert.deepStrictEqual(calls.setTitle, ['Connecting - Work']);
		assert.strictEqual(calls.prevented, 1);
	});

	it('leaves the native title update alone with the default app.title', () => {
		const calls = run('Microsoft Teams', 'Chat | Microsoft Teams');
		assert.deepStrictEqual(calls.setTitle, []);
		assert.strictEqual(calls.prevented, 0);
	});

	it('always forwards the raw page title to the renderer', () => {
		const calls = run('Work', 'Chat | Microsoft Teams');
		assert.deepStrictEqual(calls.sent, [['page-title', 'Chat | Microsoft Teams']]);
	});
});

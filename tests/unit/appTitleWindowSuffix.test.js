'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// Regression guard for #3035: a custom app.title replaces the trailing
// "Microsoft Teams" in the window title, while the default leaves Electron
// mirroring document.title. app/mainAppWindow/index.js requires the electron
// runtime, so the handlers are extracted from source and run against stubs.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');
const source = readFileSync(INDEX_PATH, 'utf8');
const extract = (signature) =>
	source.match(new RegExp(`function ${signature} \\{[\\s\\S]*?\\n\\}`))?.[0];
const formatSource = extract('formatWindowTitle\\(title\\)');
const handlerSource = extract('onPageTitleUpdated\\(event, title\\)');
const overrideSource = extract('setTitleOverride\\(title\\)');

function load(appTitle, rootTitle = '') {
	const calls = { sent: [], setTitle: [], prevented: 0 };
	const root = { title: rootTitle };
	const window = {
		webContents: {
			send: (channel, value) => calls.sent.push([channel, value]),
			getTitle: () => root.title,
		},
		setTitle: (value) => calls.setTitle.push(value),
		isDestroyed: () => false,
	};
	const fns = vm.runInNewContext(
		`${formatSource}\n${handlerSource}\n${overrideSource}\n({ onPageTitleUpdated, setTitleOverride })`,
		{ window, config: { appTitle }, titleOverride: null }
	);
	// The root webContents' title changes before Electron emits the update.
	const update = (title) => {
		root.title = title;
		fns.onPageTitleUpdated({ preventDefault: () => calls.prevented++ }, title);
	};
	return { calls, update, setTitleOverride: fns.setTitleOverride };
}

function run(appTitle, title) {
	const { calls, update } = load(appTitle);
	update(title);
	return calls;
}

describe('onPageTitleUpdated app.title', () => {
	it('exists', () => {
		assert.ok(formatSource, 'formatWindowTitle(title) not found');
		assert.ok(handlerSource, 'onPageTitleUpdated(event, title) not found');
		assert.ok(overrideSource, 'setTitleOverride(title) not found');
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

// #3068: while another profile's view is shown, Profile 0's (root) title
// updates must not replace the window title.
describe('setTitleOverride (multi-account)', () => {
	it('shows the active profile title and blocks root updates until handed back', () => {
		const { calls, update, setTitleOverride } = load('Microsoft Teams', 'Chat | P0 | Microsoft Teams');
		setTitleOverride('Chat | B | Microsoft Teams');
		update('Activity | P0 | Microsoft Teams');
		assert.deepStrictEqual(calls.setTitle, ['Chat | B | Microsoft Teams']);
		assert.strictEqual(calls.prevented, 1);
		assert.deepStrictEqual(calls.sent, [['page-title', 'Activity | P0 | Microsoft Teams']]);

		// Hand-back restores Profile 0's latest title, not the one before B.
		setTitleOverride(null);
		assert.deepStrictEqual(calls.setTitle.at(-1), 'Activity | P0 | Microsoft Teams');
		update('Calendar | P0 | Microsoft Teams');
		assert.strictEqual(calls.prevented, 1);
	});

	it('applies a custom app.title to the profile title and the hand-back, skipping a redundant one', () => {
		const { calls, update, setTitleOverride } = load('Work', 'Chat | Microsoft Teams');
		setTitleOverride(null);
		assert.deepStrictEqual(calls.setTitle, []);
		setTitleOverride('Chat | B | Microsoft Teams');
		update('Activity | Microsoft Teams');
		setTitleOverride(null);
		assert.deepStrictEqual(calls.setTitle, ['Chat | B | Work', 'Activity | Work']);
	});
});

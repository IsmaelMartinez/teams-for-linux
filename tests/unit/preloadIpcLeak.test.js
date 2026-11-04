'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for GHSA-3vg9-cwq9-p773. The Teams window runs with
// contextIsolation off, so globalThis.electronAPI lives in the page's own
// world. ipcRenderer.on/once return the raw ipcRenderer, and the event they
// pass to listeners carries it as event.sender, so no electronAPI helper may
// return their result or hand a page callback the event. Source-text
// assertion because preload.js requires the electron runtime.

const PRELOAD_PATH = join(__dirname, '..', '..', 'app', 'browser', 'preload.js');

describe('preload electronAPI does not leak ipcRenderer', () => {
	const source = readFileSync(PRELOAD_PATH, 'utf8');
	const api = source.slice(source.indexOf('globalThis.electronAPI = {'));

	it('never returns the result of ipcRenderer.on or once', () => {
		assert.doesNotMatch(api, /return\s+ipcRenderer\.(on|once)\(/);
		assert.doesNotMatch(api, /=>\s*ipcRenderer\.(on|once)\(/);
	});

	it('never registers a page-supplied callback as the raw listener', () => {
		assert.doesNotMatch(api, /ipcRenderer\.(on|once)\([^,]+,\s*callback\s*\)/);
	});

	for (const channel of ['select-source', 'system-theme-changed', 'navigation-state-changed']) {
		it(`strips the event before calling back for ${channel}`, () => {
			const pattern = new RegExp(`ipcRenderer\\.(on|once)\\("${channel}", \\(_event, \\.\\.\\.args\\) => callback\\(\\.\\.\\.args\\)\\)`);
			assert.match(api, pattern);
		});
	}
});

// GHSA-58j7-22f8-6xqp: page script can dispatch its own DOMContentLoaded and
// patch shared built-ins (Object.prototype setters, WeakMap.prototype.set,
// Function.prototype.bind) to catch ipcRenderer as module init stores it.
describe('preload does not hand ipcRenderer to page script', () => {
	const source = readFileSync(PRELOAD_PATH, 'utf8');
	const api = source.slice(source.indexOf('globalThis.electronAPI = {'));

	it('runs module init once, and only for the browser\'s own DOMContentLoaded', () => {
		assert.match(source, /addEventListener\('DOMContentLoaded', async \(event\) => \{\s*if \(!event\.isTrusted \|\| browserModulesStarted\) return;\s*browserModulesStarted = true;/);
	});

	it('exposes no generic send to any channel', () => {
		assert.doesNotMatch(api, /^\s*send:\s*\(channel/m);
	});

	it('keeps the PiP frame name out of electronAPI.getConfig', () => {
		assert.match(api, /const pageConfig = await ipcRenderer\.invoke\("get-config"\);\s*delete pageConfig\.documentPictureInPictureFrameName;\s*return pageConfig;/);
	});

	const browserDir = join(__dirname, '..', '..', 'app', 'browser');
	const files = readdirSync(browserDir, { recursive: true })
		.filter((f) => f.endsWith('.js') && f !== 'preload.js')
		.map((f) => join(browserDir, f));

	it('no browser module stores ipcRenderer where page script can reach it', () => {
		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			assert.doesNotMatch(text, /this\.ipcRenderer\s*=/, `${file} stores ipcRenderer on this`);
			assert.doesNotMatch(text, /\.set\(this,\s*ipcRenderer\)/, `${file} stores ipcRenderer in a WeakMap`);
		}
	});
});

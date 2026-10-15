'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
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

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard: a link whose scheme has no handling app (Teams' macOS
// "Open privacy settings" button, for one) makes shell.openExternal reject.
// Uncaught, that reaches the process-wide unhandledRejection handler in
// app/index.js, which exits the app. Source-text assertion because
// app/mainAppWindow/index.js requires the electron runtime.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');

describe('openInBrowser handles a rejected openExternal', () => {
	const source = readFileSync(INDEX_PATH, 'utf8');
	const fn = source.match(/function openInBrowser\(details\) \{[\s\S]*?\n\}/)?.[0];

	it('exists', () => {
		assert.ok(fn, 'openInBrowser(details) not found');
	});

	it('catches the openExternal promise', () => {
		assert.match(fn, /shell\.openExternal\(details\.url\)\.catch\(/);
	});

	it('logs only the scheme, never the URL', () => {
		const handler = fn.slice(fn.indexOf('.catch('));
		const logCall = handler.match(/console\.error\([^;]*\);/)?.[0] ?? '';
		assert.match(logCall, /scheme/);
		assert.doesNotMatch(logCall, /details\.url/);
	});
});

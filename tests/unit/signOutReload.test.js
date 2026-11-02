'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard: signing out ends on Microsoft's "You signed out of your
// account" page, which has no way back to sign-in, so onDidFinishLoad loads
// Teams again when that page comes up. Source-text assertion because
// app/mainAppWindow/index.js requires the electron runtime.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');

describe('onDidFinishLoad leaves the signed-out page', () => {
	const source = readFileSync(INDEX_PATH, 'utf8');
	const fn = source.match(/function onDidFinishLoad\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
	const match = fn.match(/if \(hostname === "login\.microsoftonline\.com" && (\/.*?\/)\.test\(pathname\)\)/);

	it('matches the logout page path and nothing else on the login host', () => {
		assert.ok(match, 'logout page check not found');
		const re = new RegExp(match[1].slice(1, -1));
		assert.match('/common/oauth2/v2.0/logout', re);
		assert.match('/common/oauth2/logoutsession', re);
		assert.doesNotMatch('/common/oauth2/v2.0/authorize', re);
		assert.doesNotMatch('/common/login', re);
	});

	it('loads the configured Teams URL again', () => {
		assert.match(fn, /window\.loadURL\(config\.url, \{ userAgent: config\.chromeUserAgent \}\)/);
	});
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for #2722: a partial auth block in config.json resolves
// keepMsalCacheEncryptionCookie.enabled to undefined, so the guard must only
// bail out on an explicit false. Source-text assertion because
// app/mainAppWindow/index.js requires the electron runtime.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');

describe('keepMsalEncryptionCookiePersistent guard', () => {
	const source = readFileSync(INDEX_PATH, 'utf8');

	it('bails out only on an explicit enabled === false', () => {
		assert.match(
			source,
			/config\?\.auth\?\.keepMsalCacheEncryptionCookie\?\.enabled\s*===\s*false/,
			'undefined (partial auth block, #2722) must keep the cookie persistence on',
		);
	});

	it('does not use a truthiness guard that treats undefined as disabled', () => {
		assert.doesNotMatch(
			source,
			/!\s*config\?\.auth\?\.keepMsalCacheEncryptionCookie\?\.enabled/,
			'a truthiness guard disables the feature for any partial auth block (#2722)',
		);
	});
});

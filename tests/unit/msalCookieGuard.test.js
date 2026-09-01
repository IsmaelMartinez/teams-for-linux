'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for issue #2722. yargs v18 replaces object-typed options
// wholesale instead of deep-merging them, so a config.json carrying a partial
// `auth` block (for example the FIDO2 snippet from the troubleshooting docs)
// resolves `auth.keepMsalCacheEncryptionCookie.enabled` to undefined rather
// than its declared default of true. The guard in
// `keepMsalEncryptionCookiePersistent` must therefore only bail out on an
// explicit `false`; a truthiness check silently disables the msal cookie
// persistence for every partial-auth user and resurrects the #2681
// lost-settings-on-restart bug.
//
// `app/mainAppWindow/index.js` requires the `electron` runtime, so it cannot
// be `require`d from a plain Node test. Asserting on the source text follows
// the same pattern as preloadModules.test.js.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');

describe('keepMsalEncryptionCookiePersistent guard', () => {
	const source = readFileSync(INDEX_PATH, 'utf8');

	it('bails out only on an explicit enabled === false', () => {
		const explicitFalseGuard =
			/config\?\.auth\?\.keepMsalCacheEncryptionCookie\?\.enabled\s*===\s*false\)\s*return/;
		assert.match(
			source,
			explicitFalseGuard,
			'expected the guard to compare enabled === false so an undefined value (partial auth block, #2722) keeps the cookie persistence on',
		);
	});

	it('does not use a truthiness guard that treats undefined as disabled', () => {
		const truthinessGuard =
			/!\s*config\?\.auth\?\.keepMsalCacheEncryptionCookie\?\.enabled/;
		assert.doesNotMatch(
			source,
			truthinessGuard,
			'a truthiness guard turns the feature off for any config.json with a partial auth block (#2722)',
		);
	});
});

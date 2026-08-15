'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildDeprecationWarning } = require('../../app/config/deprecation');

describe('buildDeprecationWarning - nothing to report', () => {
	it('returns null when no deprecated option appears in the config file', () => {
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer' },
			{ appTitle: 'Teams' }
		);
		assert.strictEqual(warning, null);
	});

	it('returns null when no option is declared deprecated', () => {
		assert.strictEqual(buildDeprecationWarning({}, { proxyServer: 'http://x' }), null);
	});

	it('returns null for missing or empty inputs', () => {
		assert.strictEqual(buildDeprecationWarning(undefined, undefined), null);
		assert.strictEqual(buildDeprecationWarning({ webDebug: true }, null), null);
	});

	it('ignores inherited keys so a polluted prototype cannot trigger a warning', () => {
		const polluted = Object.create({ webDebug: true });
		assert.strictEqual(buildDeprecationWarning({ webDebug: true }, polluted), null);
	});
});

describe('buildDeprecationWarning - aggregation', () => {
	// The headline contract: one string covering every deprecated option in use,
	// because app/index.js opens a blocking modal per entry in config.warnings.
	it('reports every deprecated option in use in a single message', () => {
		const warning = buildDeprecationWarning(
			{
				proxyServer: 'use network.proxyServer',
				clearStorageData: 'use storage.clearData',
				webDebug: 'use development.webDebug',
			},
			{ proxyServer: 'http://localhost:3128', clearStorageData: {}, webDebug: true }
		);

		assert.strictEqual(typeof warning, 'string');
		assert.match(warning, /^3 configuration options are deprecated/);
		assert.match(warning, /^ {2}- proxyServer: use network\.proxyServer$/m);
		assert.match(warning, /^ {2}- clearStorageData: use storage\.clearData$/m);
		assert.match(warning, /^ {2}- webDebug: use development\.webDebug$/m);
	});

	it('uses singular wording for exactly one deprecated option', () => {
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer' },
			{ proxyServer: 'http://x' }
		);
		assert.match(warning, /^1 configuration option is deprecated/);
	});

	it('omits the detail when an option declares `deprecated: true` with no text', () => {
		const warning = buildDeprecationWarning({ webDebug: true }, { webDebug: true });
		assert.match(warning, /^ {2}- webDebug$/m);
	});

	it('ignores deprecated options the user has not set', () => {
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer', webDebug: 'use development.webDebug' },
			{ webDebug: true }
		);
		assert.match(warning, /^1 configuration option is deprecated/);
		assert.doesNotMatch(warning, /proxyServer/);
	});

	it('reports a deprecated option even when its value is falsy', () => {
		const warning = buildDeprecationWarning({ webDebug: true }, { webDebug: false });
		assert.match(warning, /^1 configuration option is deprecated/);
	});

	// PII safety (CLAUDE.md): names and the author-written text only, no values.
	it('never includes the configured value', () => {
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer' },
			{ proxyServer: 'http://user:secret@proxy.internal:3128' }
		);
		assert.doesNotMatch(warning, /secret/);
		assert.doesNotMatch(warning, /proxy\.internal/);
	});
});

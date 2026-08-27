'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
	buildDeprecationWarning,
	isMigrationMenuAvailable,
} = require('../../app/config/deprecation');
const options = require('../../app/config/options');

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

describe('buildDeprecationWarning - pointing at the migration', () => {
	const deprecated = { clearStorageData: 'use storage.clearData' };
	const configFile = { clearStorageData: true };

	it('points at the menu entry when the menu exists', () => {
		const warning = buildDeprecationWarning(deprecated, configFile, true);
		assert.match(warning, /Show Updated Config/);
	});

	// Some configurations leave no surface carrying Settings at all; see
	// isMigrationMenuAvailable. Those users have nowhere to click.
	it('says nothing about the menu when there is no menu', () => {
		const warning = buildDeprecationWarning(deprecated, configFile, false);
		assert.doesNotMatch(warning, /Show Updated Config/);
	});

	it('omits the pointer when the caller does not say either way', () => {
		const warning = buildDeprecationWarning(deprecated, configFile);
		assert.doesNotMatch(warning, /Show Updated Config/);
	});

	it('still leads with the deprecated options, not the pointer', () => {
		const warning = buildDeprecationWarning(deprecated, configFile, true);
		assert.match(warning, /^1 configuration option is deprecated/);
	});
});

describe('isMigrationMenuAvailable', () => {
	// The regression this function exists for: the gate used to read
	// trayIconEnabled alone, so turning the tray off suppressed the pointer
	// for users whose menu bar still carried the entry.
	it('finds the menu bar even with the tray icon off', () => {
		assert.strictEqual(
			isMigrationMenuAvailable({ menubar: 'auto', trayIconEnabled: false }),
			true
		);
	});

	it('finds the tray menu when the menu bar is hidden', () => {
		assert.strictEqual(
			isMigrationMenuAvailable({ menubar: 'hidden', trayIconEnabled: true }),
			true
		);
	});

	// Menu bar removed and no tray: nothing carries the Settings submenu.
	it('reports nothing reachable when both surfaces are gone', () => {
		assert.strictEqual(
			isMigrationMenuAvailable({ menubar: 'hidden', trayIconEnabled: false }),
			false
		);
	});

	it('treats an explicitly visible menu bar as reachable', () => {
		assert.strictEqual(
			isMigrationMenuAvailable({ menubar: 'visible', trayIconEnabled: false }),
			true
		);
	});

	// Pinned against options.js rather than hardcoded: if either default moves,
	// the pointer's reach changes and this should say so.
	it('is reachable under the shipped defaults', () => {
		assert.strictEqual(
			isMigrationMenuAvailable({
				menubar: options.menubar.default,
				trayIconEnabled: options.trayIconEnabled.default,
			}),
			true
		);
	});

	it('reports nothing reachable rather than throwing on a missing config', () => {
		assert.strictEqual(isMigrationMenuAvailable(undefined), false);
	});
});

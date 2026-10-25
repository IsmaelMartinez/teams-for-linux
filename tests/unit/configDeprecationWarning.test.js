'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
	buildDeprecationWarning,
	isMigrationMenuAvailable,
} = require('../../app/config/deprecation');
const options = require('../../app/config/options');

describe('buildDeprecationWarning - nothing to report', () => {
	it('returns null when no deprecated option appears in any source', () => {
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer' },
			{ file: { appTitle: 'Teams' }, cli: { webDebug: true }, env: {} }
		);
		assert.strictEqual(warning, null);
	});

	it('returns null when no option is declared deprecated', () => {
		assert.strictEqual(buildDeprecationWarning({}, { file: { proxyServer: 'http://x' } }), null);
	});

	it('returns null for missing or empty inputs', () => {
		assert.strictEqual(buildDeprecationWarning(undefined, undefined), null);
		assert.strictEqual(buildDeprecationWarning({ webDebug: true }, null), null);
		assert.strictEqual(buildDeprecationWarning({ webDebug: true }, { file: null }), null);
	});

	it('ignores inherited keys so a polluted prototype cannot trigger a warning', () => {
		const polluted = Object.create({ webDebug: true });
		assert.strictEqual(
			buildDeprecationWarning({ webDebug: true }, { file: polluted, cli: polluted, env: polluted }),
			null
		);
	});
});

describe('buildDeprecationWarning - aggregation', () => {
	// The headline contract: one string covering every deprecated option in use,
	// so a config with several of them shows one message rather than a wall of
	// near-identical lines.
	it('reports every deprecated option in use in a single message', () => {
		const warning = buildDeprecationWarning(
			{
				proxyServer: 'use network.proxyServer',
				clearStorageData: 'use storage.clearData',
				webDebug: 'use development.webDebug',
			},
			{ file: { proxyServer: 'http://localhost:3128', clearStorageData: {}, webDebug: true } }
		);

		assert.strictEqual(typeof warning, 'string');
		assert.match(warning, /^3 configuration options are deprecated and stop working in 2\.32\.0:/);
		assert.match(warning, /^ {2}- proxyServer \(config file\): use network\.proxyServer$/m);
		assert.match(warning, /^ {2}- clearStorageData \(config file\): use storage\.clearData$/m);
		assert.match(warning, /^ {2}- webDebug \(config file\): use development\.webDebug$/m);
	});

	it('uses singular wording for exactly one deprecated option', () => {
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer' },
			{ file: { proxyServer: 'http://x' } }
		);
		assert.match(warning, /^1 configuration option is deprecated and stops working in 2\.32\.0:/);
	});

	it('omits the detail when an option declares `deprecated: true` with no text', () => {
		const warning = buildDeprecationWarning({ webDebug: true }, { file: { webDebug: true } });
		assert.match(warning, /^ {2}- webDebug \(config file\)$/m);
	});

	it('ignores deprecated options the user has not set', () => {
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer', webDebug: 'use development.webDebug' },
			{ file: { webDebug: true } }
		);
		assert.match(warning, /^1 configuration option is deprecated/);
		assert.doesNotMatch(warning, /proxyServer/);
	});

	it('reports a deprecated option even when its value is falsy', () => {
		const warning = buildDeprecationWarning({ webDebug: true }, { file: { webDebug: false } });
		assert.match(warning, /^1 configuration option is deprecated/);
	});

	// PII safety (CLAUDE.md): names and the author-written text only, no values.
	it('never includes the configured value from any source', () => {
		const secret = 'http://user:secret@proxy.internal:3128';
		const warning = buildDeprecationWarning(
			{ proxyServer: 'use network.proxyServer' },
			{ file: { proxyServer: secret }, cli: { proxyServer: secret }, env: { proxyServer: secret } }
		);
		assert.doesNotMatch(warning, /secret/);
		assert.doesNotMatch(warning, /proxy\.internal/);
	});
});

// The modal's "Don't show this again" is keyed on a hash of this text, so any
// drift between launches with the same settings would prompt again every time.
describe('buildDeprecationWarning - stable text for the acknowledge-once modal', () => {
	const deprecated = {
		webDebug: 'use development.webDebug',
		appTitle: 'use app.title',
		url: 'use app.url',
	};

	it('lists options in name order, not declaration order', () => {
		const warning = buildDeprecationWarning(deprecated, {
			file: { webDebug: true, url: 'x', appTitle: 'y' },
		});
		const names = [...warning.matchAll(/^ {2}- (\w+)/gm)].map((m) => m[1]);
		assert.deepStrictEqual(names, ['appTitle', 'url', 'webDebug']);
	});

	it('is identical regardless of the order the inputs list their keys', () => {
		const reversed = Object.fromEntries(Object.entries(deprecated).reverse());
		const a = buildDeprecationWarning(deprecated, { file: { url: 1, webDebug: 1 } }, true);
		const b = buildDeprecationWarning(reversed, { file: { webDebug: 2, url: 2 } }, true);
		assert.strictEqual(a, b);
	});

	it('does not change with the values the user set', () => {
		const a = buildDeprecationWarning(deprecated, { file: { url: 'https://a' } }, true);
		const b = buildDeprecationWarning(deprecated, { file: { url: 'https://b' } }, true);
		assert.strictEqual(a, b);
	});

	it('changes when the user sets another deprecated option, so it prompts again', () => {
		const a = buildDeprecationWarning(deprecated, { file: { url: 'x' } }, true);
		const b = buildDeprecationWarning(deprecated, { file: { url: 'x', appTitle: 'y' } }, true);
		assert.notStrictEqual(a, b);
	});
});

// Gate B in #2842: the flat names stop working for command-line and
// environment users too, so they must be told as well.
describe('buildDeprecationWarning - command line and environment', () => {
	const deprecated = { webDebug: 'use development.webDebug', partition: 'use app.partition' };

	it('reports a deprecated flat name passed as a command-line flag', () => {
		const warning = buildDeprecationWarning(deprecated, { cli: { webDebug: true } });
		assert.match(warning, /^ {2}- webDebug \(command line\): use development\.webDebug$/m);
	});

	it('reports a deprecated flat name set as an environment variable', () => {
		const warning = buildDeprecationWarning(deprecated, { env: { partition: 'p' } });
		assert.match(warning, /^ {2}- partition \(environment variable\): use app\.partition$/m);
	});

	it('names every source an option was set in, in a fixed order', () => {
		const warning = buildDeprecationWarning(deprecated, {
			env: { webDebug: true },
			cli: { webDebug: true },
			file: { webDebug: true },
		});
		assert.match(warning, /^ {2}- webDebug \(config file, command line, environment variable\):/m);
	});

	// Show Updated Config rewrites the file only; flags and variables are the
	// user's to change.
	it('says how to rename flags and variables by hand', () => {
		const warning = buildDeprecationWarning(deprecated, { cli: { webDebug: true } }, true);
		assert.match(warning, /--window\.frame/);
		assert.match(warning, /WINDOW__FRAME/);
		assert.doesNotMatch(warning, /Show Updated Config/);
	});

	it('leaves out the by-hand note when only the config file is involved', () => {
		const warning = buildDeprecationWarning(deprecated, { file: { webDebug: true } }, true);
		assert.doesNotMatch(warning, /WINDOW__FRAME/);
	});
});

describe('buildDeprecationWarning - pointing at the migration', () => {
	const deprecated = { clearStorageData: 'use storage.clearData' };
	const sources = { file: { clearStorageData: true } };

	it('points at the menu entry when the menu exists', () => {
		const warning = buildDeprecationWarning(deprecated, sources, true);
		assert.match(warning, /Show Updated Config/);
	});

	// Some configurations leave no surface carrying Settings at all; see
	// isMigrationMenuAvailable. Those users have nowhere to click.
	it('says nothing about the menu when there is no menu', () => {
		const warning = buildDeprecationWarning(deprecated, sources, false);
		assert.doesNotMatch(warning, /Show Updated Config/);
	});

	it('omits the pointer when the caller does not say either way', () => {
		const warning = buildDeprecationWarning(deprecated, sources);
		assert.doesNotMatch(warning, /Show Updated Config/);
	});

	it('still leads with the deprecated options, not the pointer', () => {
		const warning = buildDeprecationWarning(deprecated, sources, true);
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

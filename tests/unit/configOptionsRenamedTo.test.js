'use strict';

// Pins the ADR-025 rename table in executable form: the full old-name →
// nested-target mapping, target well-formedness and uniqueness, and the four
// polarity-inverting renames.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const options = require('../../app/config/options');

// The authoritative rename table from ADR-025. A change here must match a
// change to the ADR, and vice versa.
const EXPECTED_RENAMES = {
	appTitle: 'app.title',
	url: 'app.url',
	partition: 'app.partition',
	frame: 'window.frame',
	menubar: 'window.menubar',
	minimized: 'window.minimized',
	closeAppOnCross: 'window.closeOnCross',
	minimizeOnClose: 'window.minimizeOnClose',
	alwaysOnTop: 'window.alwaysOnTop',
	class: 'window.class',
	customCSSName: 'appearance.cssName',
	customCSSLocation: 'appearance.cssLocation',
	followSystemTheme: 'appearance.followSystemTheme',
	trayIconEnabled: 'tray.enabled',
	appIcon: 'tray.icon',
	appIconType: 'tray.iconType',
	useMutationTitleLogic: 'tray.useMutationTitleLogic',
	disableNotifications: 'notifications.enabled',
	disableNotificationSound: 'notifications.sound.enabled',
	disableNotificationSoundIfNotAvailable: 'notifications.sound.onlyWhenAvailable',
	disableNotificationWindowFlash: 'notifications.windowFlash',
	disableBadgeCount: 'notifications.badgeCountEnabled',
	notificationMethod: 'notifications.method',
	defaultNotificationUrgency: 'notifications.urgency',
	enableIncomingCallToast: 'incomingCalls.toast',
	incomingCallCommand: 'incomingCalls.command',
	incomingCallCommandArgs: 'incomingCalls.commandArgs',
	awayOnSystemIdle: 'idleDetection.setAwayOnIdle',
	appIdleTimeout: 'idleDetection.timeout',
	appIdleTimeoutCheckInterval: 'idleDetection.checkInterval.detectIdle',
	appActiveCheckInterval: 'idleDetection.checkInterval.detectActive',
	authServerWhitelist: 'auth.serverWhitelist',
	ssoBasicAuthUser: 'auth.basic.user',
	ssoBasicAuthPasswordCommand: 'auth.basic.passwordCommand',
	clientCertPath: 'auth.clientCertificate.path',
	clientCertPassword: 'auth.clientCertificate.password',
	customCACertsFingerprints: 'auth.customCACertificateFingerprints',
	proxyServer: 'network.proxyServer',
	isCustomBackgroundEnabled: 'customBackground.enabled',
	customBGServiceBaseUrl: 'customBackground.serviceBaseUrl',
	customBGServiceConfigFetchInterval: 'customBackground.configFetchInterval',
	defaultURLHandler: 'urlHandling.defaultHandler',
	meetupJoinRegEx: 'urlHandling.meetupJoinRegEx',
	onNewWindowOpenMeetupJoinUrlInApp: 'urlHandling.openMeetupJoinInApp',
	globalShortcuts: 'shortcuts.global',
	disableGlobalShortcuts: 'shortcuts.disableWhileFocused',
	disableGpu: 'performance.disableGpu',
	electronCLIFlags: 'performance.electronCLIFlags',
	clearStorageData: 'storage.clearData',
	webDebug: 'development.webDebug',
	watchConfigFile: 'development.watchConfigFile',
	chromeUserAgent: 'platform.chromeUserAgent',
	emulateWinChromiumPlatform: 'platform.emulateWindowsChromium',
	spellCheckerLanguages: 'platform.spellCheckerLanguages',
	disableTimestampOnCopy: 'platform.disableTimestampOnCopy',
};

// The four renames that invert a boolean's meaning; migration tooling must
// negate these values, never copy them.
const EXPECTED_INVERTS = [
	'disableNotifications',
	'disableNotificationSound',
	'disableNotificationWindowFlash',
	'disableBadgeCount',
];

const entries = Object.entries(options);
const withRename = entries.filter(([, def]) => def.renamedTo !== undefined);
const withInverts = entries.filter(([, def]) => def.renameInverts !== undefined);

describe('Config options renamedTo metadata (ADR-025)', () => {
	it('matches the ADR-025 rename table exactly', () => {
		const actual = Object.fromEntries(
			withRename.map(([name, def]) => [name, def.renamedTo]),
		);
		assert.deepStrictEqual(actual, EXPECTED_RENAMES);
	});

	it('marks all 55 flat options and no object options', () => {
		const flat = entries.filter(([, def]) => def.type !== 'object');
		const objects = entries.filter(([, def]) => def.type === 'object');
		assert.strictEqual(
			flat.length,
			55,
			'Flat option count changed. ADR-025 rule zero: new options use nested ' +
				'names from day one, so no new flat options should appear. If you ' +
				'added a flat option, nest it instead; if you migrated or removed ' +
				'one, update ADR-025 and this test together.',
		);
		for (const [name, def] of flat) {
			assert.notStrictEqual(def.renamedTo, undefined, `flat option "${name}" is missing renamedTo`);
		}
		for (const [name, def] of objects) {
			assert.strictEqual(def.renamedTo, undefined, `object option "${name}" must not carry renamedTo`);
		}
	});

	it('uses non-empty dotted paths as targets', () => {
		for (const [name, def] of withRename) {
			assert.strictEqual(typeof def.renamedTo, 'string', `"${name}" renamedTo must be a string`);
			const segments = def.renamedTo.split('.');
			assert.ok(segments.length >= 2, `"${name}" renamedTo "${def.renamedTo}" must be a dotted path`);
			for (const segment of segments) {
				assert.ok(segment.trim() !== '', `"${name}" renamedTo "${def.renamedTo}" has an empty segment`);
			}
		}
	});

	it('never maps two options to the same target', () => {
		const targets = withRename.map(([, def]) => def.renamedTo);
		assert.strictEqual(new Set(targets).size, targets.length, 'renamedTo targets must be unique');
	});

	it('marks exactly the four polarity-inverting renames', () => {
		assert.deepStrictEqual(
			new Set(withInverts.map(([name]) => name)),
			new Set(EXPECTED_INVERTS),
		);
		for (const [name, def] of withInverts) {
			assert.strictEqual(def.renameInverts, true, `"${name}" renameInverts must be literally true`);
			assert.strictEqual(def.type, 'boolean', `"${name}" renameInverts only makes sense on booleans`);
			assert.notStrictEqual(def.renamedTo, undefined, `"${name}" renameInverts requires renamedTo`);
		}
	});
});

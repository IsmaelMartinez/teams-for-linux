'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// ADR-032: a secondary window runs the same preload with a role passed through
// `additionalArguments`. Source-text assertions, as in preloadModules.test.js,
// because preload.js requires the electron runtime.

const PRELOAD_PATH = join(__dirname, '..', '..', 'app', 'browser', 'preload.js');
const MAIN_ONLY = ['trayIconRenderer', 'mqttStatusMonitor', 'meetingStartDetector', 'dockIconRenderer'];

describe('preload.js window role', () => {
	const source = readFileSync(PRELOAD_PATH, 'utf8');

	it('reads the role from the --tfl-window-role argument and defaults to main', () => {
		assert.match(source, /const WINDOW_ROLE_ARG = "--tfl-window-role=";/);
		assert.match(source, /process\.argv\.find\(\(arg\) => arg\.startsWith\(WINDOW_ROLE_ARG\)\)/);
		assert.match(source, /\|\| "main";/);
		assert.match(source, /const IS_MAIN_WINDOW = WINDOW_ROLE === "main";/);
	});

	const match = source.match(/const\s+MAIN_WINDOW_ONLY_MODULES\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/);
	const declared = match ? (match[1].match(/"[^"]*"|'[^']*'/g) || []).map((s) => s.slice(1, -1)) : [];

	for (const name of MAIN_ONLY) {
		it(`keeps "${name}" in the main window only`, () => {
			assert.ok(declared.includes(name), `"${name}" missing from MAIN_WINDOW_ONLY_MODULES`);
		});
	}

	it('skips main-only modules when the role is not main', () => {
		assert.match(source, /if \(!IS_MAIN_WINDOW && MAIN_WINDOW_ONLY_MODULES\.has\(module\.name\)\) \{\s*continue;/);
	});

	it('runs the title observer in the main window only', () => {
		assert.match(source, /if \(config\.useMutationTitleLogic && IS_MAIN_WINDOW\)/);
	});

	it('suppresses notifications outside the main window before any config check', () => {
		const factory = source.slice(source.indexOf('function CustomNotification(title, options) {'));
		const roleGuard = factory.indexOf('if (!IS_MAIN_WINDOW) {');
		const configGuard = factory.indexOf('notificationConfig?.disableNotifications');
		assert.ok(roleGuard > -1, 'role guard missing from the Notification factory');
		assert.ok(roleGuard < configGuard, 'role guard must come before the config checks');
		assert.match(factory.slice(roleGuard, configGuard), /return createNotificationStub\(\);/);
	});

	it('forwards incoming calls from the main window only', () => {
		assert.match(source, /new ActivityManager\(ipcRenderer, config, \{ forwardIncomingCalls: IS_MAIN_WINDOW \}\)\.start\(\);/);
	});
});

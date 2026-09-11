'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { computeDesktopUri } = require('../../app/downloadManager/launcherEntryEmitter');

// Receivers (Ubuntu Dock, Dash-to-Dock) match LauncherEntry signals against
// the desktop file as exported on the host, so the URI has to follow the
// packaging. A wrong URI is dropped silently: no badge, no progress.
describe('launcherEntryEmitter.computeDesktopUri', () => {
	it('uses the plain app name for deb/rpm/AppImage installs', () => {
		assert.strictEqual(
			computeDesktopUri('teams-for-linux', {}),
			'application://teams-for-linux.desktop',
		);
	});

	it('prefixes the snap instance name the way snapd exports desktop files', () => {
		assert.strictEqual(
			computeDesktopUri('teams-for-linux', {
				SNAP_NAME: 'teams-for-linux',
				SNAP_INSTANCE_NAME: 'teams-for-linux',
			}),
			'application://teams-for-linux_teams-for-linux.desktop',
		);
	});

	it('keeps parallel snap instances distinct', () => {
		assert.strictEqual(
			computeDesktopUri('teams-for-linux', {
				SNAP_NAME: 'teams-for-linux',
				SNAP_INSTANCE_NAME: 'teams-for-linux_work',
			}),
			'application://teams-for-linux_work_teams-for-linux.desktop',
		);
	});

	it('ignores a custom app name under snap, where the desktop basename is fixed at build time', () => {
		assert.strictEqual(
			computeDesktopUri('my-teams', {
				SNAP_NAME: 'teams-for-linux',
				SNAP_INSTANCE_NAME: 'teams-for-linux',
			}),
			'application://teams-for-linux_teams-for-linux.desktop',
		);
	});

	it('falls back to the app name when SNAP_NAME is missing', () => {
		assert.strictEqual(
			computeDesktopUri('teams-for-linux', { SNAP_INSTANCE_NAME: 'teams-for-linux' }),
			'application://teams-for-linux_teams-for-linux.desktop',
		);
	});

	it('uses the Flatpak app id as the desktop file name', () => {
		assert.strictEqual(
			computeDesktopUri('teams-for-linux', {
				FLATPAK_ID: 'com.github.IsmaelMartinez.teams_for_linux',
			}),
			'application://com.github.IsmaelMartinez.teams_for_linux.desktop',
		);
	});

	it('lets the snap prefix win when both snap and flatpak variables are present', () => {
		assert.strictEqual(
			computeDesktopUri('teams-for-linux', {
				SNAP_NAME: 'teams-for-linux',
				SNAP_INSTANCE_NAME: 'teams-for-linux',
				FLATPAK_ID: 'com.example.ignored',
			}),
			'application://teams-for-linux_teams-for-linux.desktop',
		);
	});

	it('follows a custom app name (config `class`)', () => {
		assert.strictEqual(
			computeDesktopUri('my-teams', {}),
			'application://my-teams.desktop',
		);
	});
});

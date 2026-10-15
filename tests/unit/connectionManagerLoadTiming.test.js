'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

// On a slow link the initial Teams page load is the step users wait on, so its
// duration is logged at info level; the default log would otherwise not show
// how long Teams took to load, or how long a failed attempt ran before failing.
const electronPath = require.resolve('electron');
const connectionManagerPath = require.resolve('../../app/connectionManager');

function installElectronMock() {
	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			ipcMain: { on() {}, removeListener() {} },
			powerMonitor: { on() {}, removeListener() {} },
			net: {},
		},
	};
}

// loadURL advances the mocked clock by loadMs before settling, standing in for
// a page load that takes that long.
function managerWithFakeWindow({ loadMs, loadError }) {
	const ConnectionManager = require('../../app/connectionManager');
	const manager = new ConnectionManager();
	let url = '';
	let reloads = 0;
	const window = {
		isDestroyed: () => false,
		setTitle() {},
		reload() { reloads += 1; },
		async loadURL() {
			mock.timers.tick(loadMs);
			if (loadError) throw loadError;
		},
		webContents: {
			on() {},
			removeListener() {},
			getURL: () => url,
		},
	};
	// start() kicks off a refresh; keep it from running the connectivity sweep.
	const realRefresh = manager.refresh;
	manager.refresh = () => {};
	manager.start('https://teams.cloud.microsoft', {
		window,
		config: { url: 'https://teams.cloud.microsoft' },
	});
	manager.refresh = realRefresh;
	manager.isOnline = async () => true;
	return { manager, setUrl: (value) => { url = value; }, reloadCount: () => reloads };
}

describe('ConnectionManager initial page load timing', () => {
	const original = {};
	let infos;
	let errors;
	let manager;

	beforeEach(() => {
		installElectronMock();
		delete require.cache[connectionManagerPath];
		mock.timers.enable({ apis: ['setTimeout', 'Date'] });
		infos = [];
		errors = [];
		for (const level of ['info', 'error', 'warn', 'debug']) original[level] = console[level];
		console.info = (...args) => infos.push(args.join(' '));
		console.error = (...args) => errors.push(args.join(' '));
		console.warn = () => {};
		console.debug = () => {};
	});

	afterEach(() => {
		manager?.cleanup();
		manager = undefined;
		mock.timers.reset();
		Object.assign(console, original);
		delete require.cache[electronPath];
		delete require.cache[connectionManagerPath];
	});

	it('logs the initial load and how long it took at info level', async () => {
		({ manager } = managerWithFakeWindow({ loadMs: 2500 }));
		await manager.load(false);
		assert.deepStrictEqual(infos, [
			'[CONNECTION] Loading initial URL...',
			'[CONNECTION] Teams navigation finished in 2.5s',
		]);
		assert.deepStrictEqual(errors, []);
	});

	it('reports the elapsed time of a failed load and still schedules the retry', async () => {
		const loadError = new Error('ERR_CONNECTION_TIMED_OUT (-118) loading the page');
		let setUrl;
		let reloadCount;
		({ manager, setUrl, reloadCount } = managerWithFakeWindow({ loadMs: 3000, loadError }));
		await manager.load(false);

		assert.strictEqual(errors.length, 1);
		assert.match(errors[0], /^\[CONNECTION\] Failed to load page after 3\.0s: ERR_CONNECTION_TIMED_OUT/);
		assert.ok(!infos.some((line) => line.includes('Teams navigation finished in')), 'a failed load is not reported as finished');

		// With a page URL present, refresh() skips a healthy page, so it only
		// reloads here if the failure set needsReload; the reload only happens at
		// all if debouncedRefresh scheduled the retry.
		setUrl('https://teams.cloud.microsoft/v2/');
		mock.timers.tick(1000);
		await new Promise((r) => setImmediate(r));
		assert.strictEqual(reloadCount(), 1, 'the failed load should schedule one debounced reload');
	});

	it('reports how long the connectivity check waited before giving up', async () => {
		({ manager } = managerWithFakeWindow({ loadMs: 0 }));
		manager.isOnline = async () => {
			mock.timers.tick(4000);
			return false;
		};
		await manager.refresh();

		assert.strictEqual(errors.length, 1);
		assert.match(errors[0], /^\[CONNECTION\] No internet connection after 4\.0s$/);
		assert.strictEqual(infos.length, 0, 'an offline wait is not reported as a navigation');
	});
});

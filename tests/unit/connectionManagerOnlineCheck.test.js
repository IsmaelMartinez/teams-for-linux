'use strict';

const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

// The connectivity sweep is bounded by two different limits: PROBE_TIMEOUT_MS
// caps one probe, and ONLINE_CHECK_BUDGET_MS caps the whole table of them. The
// budget is the one that matters after a suspend/resume, where probes hang
// instead of failing fast (#2611): without it the twenty tries in the table add
// up to roughly 85 seconds of "Waiting for network..." before the escape gate
// assumes online. These tests drive the sweep on mocked timers so the real
// durations can be asserted without waiting for them.
const electronPath = require.resolve('electron');

let requestsCreated;
let resolveHostCalls;
let nativeIsOnlineCalls;

function installElectronMock() {
	requestsCreated = 0;
	resolveHostCalls = 0;
	nativeIsOnlineCalls = 0;

	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			ipcMain: { on() {}, removeListener() {} },
			powerMonitor: { on() {}, removeListener() {} },
			net: {
				// A hung probe: the request is created and ended, but neither
				// 'response' nor 'error' ever fires, so only PROBE_TIMEOUT_MS
				// settles it. This is the stale-socket case from #2611.
				request() {
					requestsCreated++;
					return { on() {}, end() {}, abort() {} };
				},
				resolveHost() {
					resolveHostCalls++;
					return new Promise(() => {});
				},
				isOnline() {
					nativeIsOnlineCalls++;
					return false;
				},
			},
		},
	};
}

// Enough mocked time for the unbounded sweep (~85s) to finish as well as the
// bounded one, so removing the budget makes these tests fail on the assertion
// rather than hang waiting for a promise that never settles.
const CLOCK_RUN_MS = 120000;

// Advance mocked time in small steps, yielding to the real macrotask queue
// between them so the awaits inside isOnline() can progress.
async function runClock(totalMs, stepMs = 100) {
	for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
		await new Promise((r) => setImmediate(r));
		mock.timers.tick(stepMs);
	}
	await new Promise((r) => setImmediate(r));
}

function newManager() {
	const ConnectionManager = require('../../app/connectionManager');
	const manager = new ConnectionManager();
	// start() would register listeners and kick off a refresh; the sweep only
	// needs a config, so shadow the prototype getter instead.
	Object.defineProperty(manager, 'config', {
		value: { url: 'https://teams.microsoft.com' },
	});
	return manager;
}

describe('ConnectionManager connectivity sweep', () => {
	before(() => {
		installElectronMock();
	});

	after(() => {
		delete require.cache[electronPath];
		delete require.cache[require.resolve('../../app/connectionManager')];
	});

	beforeEach(() => {
		installElectronMock();
		delete require.cache[require.resolve('../../app/connectionManager')];
	});

	it('gives up within the budget when every probe hangs', async () => {
		mock.timers.enable({ apis: ['setTimeout', 'Date'] });
		try {
			const manager = newManager();
			const startedAt = Date.now();
			// Stamp the mocked clock when the sweep settles: the driver below
			// keeps ticking afterwards, so reading Date.now() at the end would
			// only report how far the clock was advanced.
			let settledAt = null;
			const sweep = manager.isOnline().then((value) => {
				settledAt ??= Date.now();
				return value;
			});

			await runClock(CLOCK_RUN_MS);

			const online = await sweep;
			const elapsed = settledAt - startedAt;

			assert.strictEqual(online, true, 'escape gate still assumes online');
			// The 20s budget plus the trailing retry sleep. Probes are clamped to
			// the remaining budget, so a hung one cannot push past this.
			assert.ok(
				elapsed <= 20500,
				`sweep should settle inside the budget, took ${elapsed}ms`,
			);
		} finally {
			mock.timers.reset();
		}
	});

	it('stops probing once the budget is spent instead of running every method', async () => {
		mock.timers.enable({ apis: ['setTimeout', 'Date'] });
		try {
			const manager = newManager();
			const sweep = manager.isOnline();
			await runClock(CLOCK_RUN_MS);
			await sweep;

			// Each hung HTTPS probe costs PROBE_TIMEOUT_MS plus the retry sleep,
			// so the budget is spent long before the ten configured tries.
			assert.ok(
				requestsCreated < 10,
				`expected the HTTPS tries to be cut short, saw ${requestsCreated}`,
			);
			assert.strictEqual(
				resolveHostCalls + nativeIsOnlineCalls,
				0,
				'later methods should not run once the budget is spent',
			);
		} finally {
			mock.timers.reset();
		}
	});

	it('returns as soon as a probe succeeds', async () => {
		installElectronMock();
		delete require.cache[require.resolve('../../app/connectionManager')];
		require.cache[electronPath].exports.net.request = () => {
			requestsCreated++;
			const handlers = {};
			return {
				on(event, handler) {
					handlers[event] = handler;
				},
				end() {
					handlers.response?.();
				},
				abort() {},
			};
		};

		const manager = newManager();
		assert.strictEqual(await manager.isOnline(), true);
		assert.strictEqual(requestsCreated, 1, 'a healthy network needs one probe');
	});
});

// did-fail-load is the only thing that restarts the retry loop once a load has
// failed: refresh() takes the reload() branch from then on, and reload() cannot
// reject, so nothing else schedules another attempt. A network error missing
// from the recoverable set therefore wedges the window permanently (#2875).
describe('ConnectionManager did-fail-load retry scheduling', () => {
	before(() => {
		installElectronMock();
	});

	after(() => {
		delete require.cache[electronPath];
		delete require.cache[require.resolve('../../app/connectionManager')];
	});

	beforeEach(() => {
		installElectronMock();
		delete require.cache[require.resolve('../../app/connectionManager')];
	});

	// Drives start() far enough to capture the registered did-fail-load handler.
	// refresh() is stubbed out because start() kicks one off and the sweep is
	// covered by the tests above.
	function managerWithFakeWindow() {
		const ConnectionManager = require('../../app/connectionManager');
		const manager = new ConnectionManager();
		const listeners = {};
		const window = {
			isDestroyed: () => false,
			setTitle() {},
			webContents: {
				on(event, fn) { listeners[event] = fn; },
				removeListener() {},
				getURL: () => '',
			},
		};
		manager.refresh = () => {};
		manager.start('https://teams.cloud.microsoft', {
			window,
			config: { url: 'https://teams.cloud.microsoft' },
		});
		let scheduled = 0;
		manager.debouncedRefresh = () => { scheduled += 1; };
		return { didFailLoad: listeners['did-fail-load'], scheduledCount: () => scheduled };
	}

	// -7 is what a firewall dropping packets for an unallowed domain produces,
	// -118 what a host that refuses does. Both must schedule a retry.
	for (const [code, description] of [[-7, 'ERR_TIMED_OUT'], [-118, 'ERR_CONNECTION_TIMED_OUT']]) {
		it(`schedules a retry after a main-frame ${description}`, () => {
			const { didFailLoad, scheduledCount } = managerWithFakeWindow();
			didFailLoad({}, code, description, 'https://teams.cloud.microsoft/', true);
			assert.strictEqual(scheduledCount(), 1, `${description} should be recoverable`);
		});
	}

	it('ignores a non-network failure', () => {
		const { didFailLoad, scheduledCount } = managerWithFakeWindow();
		didFailLoad({}, -3, 'ERR_ABORTED', 'https://teams.cloud.microsoft/', true);
		assert.strictEqual(scheduledCount(), 0);
	});

	it('ignores sub-frame failures, which are routine on restricted networks', () => {
		const { didFailLoad, scheduledCount } = managerWithFakeWindow();
		didFailLoad({}, -7, 'ERR_TIMED_OUT', 'https://telemetry.example/', false);
		assert.strictEqual(scheduledCount(), 0);
	});
});

'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const modulePath = require.resolve('../../app/browser/tools/cameraAspectRatio');

const savedGlobals = {};
const GLOBAL_NAMES = ['window', 'navigator'];

function makeTrack(applyConstraints, getSettings = () => ({ width: 1280, height: 720 })) {
	return {
		readyState: 'live',
		label: 'fake camera',
		getSettings,
		applyConstraints,
		addEventListener: () => {},
	};
}

function installGlobals(track) {
	for (const name of GLOBAL_NAMES) savedGlobals[name] = Object.getOwnPropertyDescriptor(globalThis, name);
	const stream = { getVideoTracks: () => [track] };
	globalThis.window = { innerWidth: 1600, innerHeight: 900, addEventListener: () => {} };
	Object.defineProperty(globalThis, 'navigator', {
		value: { mediaDevices: { getUserMedia: async () => stream } },
		configurable: true,
		writable: true,
	});
}

function restoreGlobals() {
	for (const name of GLOBAL_NAMES) {
		if (savedGlobals[name]) Object.defineProperty(globalThis, name, savedGlobals[name]);
		else delete globalThis[name];
	}
}

async function acquireCamera() {
	delete require.cache[modulePath];
	require(modulePath).init({ media: { camera: { autoAdjustAspectRatio: { enabled: true } } } });
	await globalThis.navigator.mediaDevices.getUserMedia({ video: true });
}

describe('cameraAspectRatio fallback', () => {
	beforeEach(() => {
		mock.method(console, 'debug', () => {});
		mock.method(console, 'info', () => {});
		mock.method(console, 'warn', () => {});
		mock.method(console, 'error', () => {});
	});

	afterEach(() => {
		mock.restoreAll();
		restoreGlobals();
	});

	// The patch runs fire-and-forget, so the test waits for the retry itself
	// rather than for a turn of the event loop.
	it('retries with an ideal aspect ratio when the exact constraint is rejected', { timeout: 2000 }, async () => {
		let idealApplied;
		const retried = new Promise((resolve) => { idealApplied = resolve; });
		const applyConstraints = mock.fn(async (constraints) => {
			if (constraints.aspectRatio?.exact !== undefined) {
				const error = new Error('Cannot satisfy constraints');
				error.name = 'OverconstrainedError';
				throw error;
			}
			idealApplied();
		});
		installGlobals(makeTrack(applyConstraints));

		await acquireCamera();
		await retried;

		assert.strictEqual(applyConstraints.mock.callCount(), 2);
		assert.deepStrictEqual(applyConstraints.mock.calls[1].arguments[0], {
			aspectRatio: { ideal: 1280 / 720 },
		});
		assert.strictEqual(console.error.mock.callCount(), 0);
	});

	it('logs instead of rejecting when getSettings throws', { timeout: 2000 }, async () => {
		let warned;
		const logged = new Promise((resolve) => { warned = resolve; });
		mock.method(console, 'warn', () => warned());
		const applyConstraints = mock.fn(async () => {});
		installGlobals(makeTrack(applyConstraints, () => { throw new Error('track gone'); }));

		await acquireCamera();
		await logged;

		assert.strictEqual(applyConstraints.mock.callCount(), 0);
	});
});

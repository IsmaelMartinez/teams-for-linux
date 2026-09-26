'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const modulePath = require.resolve('../../app/browser/tools/cameraAspectRatio');

const savedGlobals = {};
const GLOBAL_NAMES = ['window', 'navigator'];

function makeTrack(applyConstraints) {
	return {
		readyState: 'live',
		label: 'fake camera',
		getSettings: () => ({ width: 1280, height: 720 }),
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
	// fixVideoTrackAspectRatio is fire-and-forget; let its awaits settle.
	await new Promise((resolve) => setImmediate(resolve));
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

	it('retries with an ideal aspect ratio when the exact constraint is rejected', async () => {
		const applyConstraints = mock.fn(async (constraints) => {
			if (constraints.aspectRatio?.exact !== undefined) {
				const error = new Error('Cannot satisfy constraints');
				error.name = 'OverconstrainedError';
				throw error;
			}
		});
		installGlobals(makeTrack(applyConstraints));

		await acquireCamera();

		assert.strictEqual(applyConstraints.mock.callCount(), 2);
		assert.deepStrictEqual(applyConstraints.mock.calls[1].arguments[0], {
			aspectRatio: { ideal: 1280 / 720 },
		});
		assert.strictEqual(console.error.mock.callCount(), 0);
	});
});

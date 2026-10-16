'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(
	path.join(__dirname, '..', '..', 'app', 'screenSharing', 'injectedScreenSharing.js'),
	'utf8',
);

// Objects built inside the vm context have a different prototype, so compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

// A class per injection: the script patches the prototype, so sharing one would stack wrappers.
function createTrackClass() {
	return class FakeTrack {
		static applied = [];
		constructor(kind, settings) {
			this.kind = kind;
			this.settings = settings;
		}
		getSettings() {
			return this.settings;
		}
		applyConstraints(constraints) {
			FakeTrack.applied.push(constraints);
			return Promise.resolve();
		}
	};
}

function inject(resolution) {
	const FakeTrack = createTrackClass();
	const seen = [];
	const reject = (constraints) => {
		seen.push(constraints);
		return Promise.reject(new Error('stubbed'));
	};
	const navigator = { mediaDevices: { getDisplayMedia: reject, getUserMedia: reject } };
	const sandbox = {
		console: { debug() {}, error() {}, info() {}, warn() {} },
		document: { readyState: 'complete', addEventListener() {} },
		MediaStreamTrack: FakeTrack,
		navigator,
		__tflScreenSharingResolution: resolution,
	};
	new vm.Script(source, { filename: 'injectedScreenSharing.js' }).runInNewContext(sandbox);

	return {
		FakeTrack,
		display: async (constraints) => {
			await navigator.mediaDevices.getDisplayMedia(constraints).catch(() => {});
			return seen.at(-1);
		},
		user: async (constraints) => {
			await navigator.mediaDevices.getUserMedia(constraints).catch(() => {});
			return seen.at(-1);
		},
		apply: async (track, constraints) => {
			await track.applyConstraints(constraints);
			return FakeTrack.applied.at(-1);
		},
		track: (kind, settings) => new FakeTrack(kind, settings),
	};
}

const teamsCaps = () => ({
	video: {
		width: { max: 1920 },
		height: { max: 1080 },
		frameRate: { max: 15 },
	},
	audio: true,
});

describe('screen sharing resolution control', () => {
	it('leaves Teams constraints untouched when disabled', async () => {
		const page = inject({ enabled: false, mode: 'remove' });
		const result = await page.display(teamsCaps());
		assert.deepStrictEqual(plain(result.video), teamsCaps().video);
		assert.strictEqual(result.audio, false);
	});

	it('defaults to disabled when no config is injected', async () => {
		const page = inject(undefined);
		const result = await page.display(teamsCaps());
		assert.deepStrictEqual(plain(result.video), teamsCaps().video);
	});

	describe('remove mode', () => {
		const page = () => inject({ enabled: true, mode: 'remove' });

		it('strips width and height caps but keeps other constraints', async () => {
			const result = await page().display(teamsCaps());
			assert.deepStrictEqual(plain(result.video), { frameRate: { max: 15 } });
		});

		it('strips legacy mandatory, optional and advanced caps', async () => {
			const result = await page().display({
				video: {
					mandatory: { chromeMediaSource: 'desktop', maxWidth: 1920, maxHeight: 1080 },
					optional: [{ minWidth: 640 }, { googNoiseReduction: true }],
					advanced: [{ width: 1280 }, { frameRate: 10 }],
				},
			});
			assert.deepStrictEqual(plain(result.video), {
				mandatory: { chromeMediaSource: 'desktop' },
				optional: [{ googNoiseReduction: true }],
				advanced: [{ frameRate: 10 }],
			});
		});

		it('also applies to getUserMedia desktop capture but not to camera requests', async () => {
			const p = page();
			const screen = await p.user({
				video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 1920 } },
			});
			assert.deepStrictEqual(plain(screen.video), { mandatory: { chromeMediaSource: 'desktop' } });

			const camera = await p.user({ video: { width: { max: 1280 } }, audio: true });
			assert.deepStrictEqual(plain(camera), { video: { width: { max: 1280 } }, audio: true });
		});
	});

	describe('override mode', () => {
		it('requests the configured size as a ceiling', async () => {
			const page = inject({ enabled: true, mode: 'override', width: 2560, height: 1080 });
			const result = await page.display(teamsCaps());
			assert.deepStrictEqual(plain(result.video), {
				frameRate: { max: 15 },
				width: { ideal: 2560, max: 2560 },
				height: { ideal: 1080, max: 1080 },
			});
		});

		it('uses mandatory max values for legacy constraint shapes', async () => {
			const page = inject({ enabled: true, mode: 'override', width: 2560, height: 1080 });
			const result = await page.display({
				video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 1920, maxHeight: 1080 } },
			});
			assert.deepStrictEqual(plain(result.video.mandatory), {
				chromeMediaSource: 'desktop',
				maxWidth: 2560,
				maxHeight: 1080,
			});
		});

		for (const [label, width, height] of [
			['missing dimensions', undefined, undefined],
			['missing height', 2560, undefined],
			['zero width', 0, 1080],
			['negative height', 2560, -1],
		]) {
			it(`keeps Teams constraints for an invalid override (${label})`, async () => {
				const page = inject({ enabled: true, mode: 'override', width, height });
				const result = await page.display(teamsCaps());
				assert.deepStrictEqual(plain(result.video), teamsCaps().video);
			});
		}
	});

	describe('applyConstraints on running tracks', () => {
		const displayTrack = (page) => page.track('video', { displaySurface: 'monitor' });
		const cameraTrack = (page) => page.track('video', {});

		it('strips caps on a display-capture track', async () => {
			const page = inject({ enabled: true, mode: 'remove' });
			const result = await page.apply(displayTrack(page), { width: { max: 1280 }, frameRate: 10 });
			assert.deepStrictEqual(plain(result), { frameRate: 10 });
		});

		it('applies the override ceiling on a display-capture track', async () => {
			const page = inject({ enabled: true, mode: 'override', width: 2560, height: 1080 });
			const result = await page.apply(displayTrack(page), { width: { max: 1280 } });
			assert.deepStrictEqual(plain(result), {
				width: { ideal: 2560, max: 2560 },
				height: { ideal: 1080, max: 1080 },
			});
		});

		it('does not touch camera or audio tracks', async () => {
			const page = inject({ enabled: true, mode: 'remove' });
			const caps = { width: { max: 1280 } };
			assert.deepStrictEqual(plain(await page.apply(cameraTrack(page), { ...caps })), caps);
			const audio = page.track('audio', { displaySurface: 'monitor' });
			assert.deepStrictEqual(plain(await page.apply(audio, { ...caps })), caps);
		});

		it('does not touch display tracks when disabled', async () => {
			const page = inject({ enabled: false, mode: 'remove' });
			const caps = { width: { max: 1280 } };
			assert.deepStrictEqual(plain(await page.apply(displayTrack(page), { ...caps })), caps);
		});

		it('keeps Teams constraints on display tracks for an invalid override', async () => {
			const page = inject({ enabled: true, mode: 'override', width: 0, height: 0 });
			const caps = { width: { max: 1280 } };
			assert.deepStrictEqual(plain(await page.apply(displayTrack(page), { ...caps })), caps);
		});
	});
});

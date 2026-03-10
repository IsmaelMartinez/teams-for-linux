# Speaking Indicator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real-time speaking indicator overlay during Teams calls so users can confirm their microphone is working without asking others.

**Architecture:** New browser tool module `speakingIndicator.js` intercepts `getUserMedia()` to capture audio streams, creates `AudioContext` + `AnalyserNode` for volume monitoring at ~10fps, and renders a fixed-position DOM overlay with speaking (green) / silent (grey) states. Config lives under `media.microphone.speakingIndicator` (boolean, default `false`). Mute detection was investigated but is not feasible with current Teams architecture (see research doc).

**Tech Stack:** Web Audio API (AudioContext, AnalyserNode), getUserMedia interception, DOM overlay with CSS animations, Electron IPC.

**Issue:** [#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)
**Research:** [speaking-indicator-research.md](../../docs-site/docs/development/research/speaking-indicator-research.md)
**Validation:** All three spikes passed on 2026-03-09.

---

## Task 1: Add config option

**Files:**
- Modify: `app/config/index.js:487-498` (media default object)

**Step 1: Add `speakingIndicator` to the `media.microphone` default**

In `app/config/index.js`, update the `media` option default:

```javascript
media: {
  default: {
    microphone: { disableAutogain: false, speakingIndicator: false },
    camera: {
      resolution: { enabled: false, mode: "remove" },
      autoAdjustAspectRatio: { enabled: false },
    },
    video: { menuEnabled: false },
  },
  describe: "Media settings for microphone, camera, and video",
  type: "object",
},
```

**Step 2: Verify config loads**

Run: `node -e "const c = require('./app/config')('.', '0.0.0'); console.log('speakingIndicator:', c.media.microphone.speakingIndicator)"`
Expected: `speakingIndicator: false`

**Step 3: Commit**

```
feat: add media.microphone.speakingIndicator config option (#2290)
```

---

## Task 2: Create the speakingIndicator browser tool module

**Files:**
- Create: `app/browser/tools/speakingIndicator.js`

**Step 1: Create the module**

```javascript
/**
 * Speaking Indicator Browser Tool
 *
 * Provides real-time visual feedback during Teams calls to confirm the
 * microphone is working. Intercepts getUserMedia to capture audio streams,
 * monitors volume via AudioContext + AnalyserNode, and renders a small
 * DOM overlay with speaking/silent/muted states.
 *
 * Also sends microphone-state-changed IPC events to activate the dormant
 * MQTT media status channel.
 *
 * Issue: #2290
 */

const LOG_PREFIX = '[SPEAKING_INDICATOR]';
const SAMPLE_INTERVAL_MS = 100;
const SILENCE_THRESHOLD = 15;

class SpeakingIndicator {
	#config;
	#ipcRenderer;
	#audioContext;
	#analyser;
	#source;
	#dataArray;
	#samplingInterval;
	#pollInterval;
	#overlayElement;
	#currentTrack;
	#lastMuteState;
	#inCall;

	init(config, ipcRenderer) {
		this.#config = config;
		this.#ipcRenderer = ipcRenderer;
		this.#inCall = false;
		this.#lastMuteState = null;

		if (!config.media?.microphone?.speakingIndicator) {
			return;
		}

		this.#patchGetUserMedia();
		this.#listenForCallEvents();

		console.info(LOG_PREFIX, 'Initialized');
	}

	#patchGetUserMedia() {
		const self = this;
		const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

		navigator.mediaDevices.getUserMedia = function getUserMedia(constraints) {
			return original(constraints).then(stream => {
				const audioTracks = stream.getAudioTracks();
				if (audioTracks.length > 0) {
					self.#onStreamAcquired(stream, audioTracks[0]);
				}
				return stream;
			});
		};

		console.debug(LOG_PREFIX, 'getUserMedia patched');
	}

	#listenForCallEvents() {
		this.#ipcRenderer.on('call-connected', () => {
			console.debug(LOG_PREFIX, 'Call connected');
			this.#inCall = true;
			this.#showOverlay();
		});

		this.#ipcRenderer.on('call-disconnected', () => {
			console.debug(LOG_PREFIX, 'Call disconnected');
			this.#inCall = false;
			this.#stopMonitoring();
			this.#hideOverlay();
		});
	}

	#onStreamAcquired(stream, track) {
		console.debug(LOG_PREFIX, 'Audio stream acquired');

		// Clean up previous monitoring if switching devices
		this.#stopMonitoring();

		this.#currentTrack = track;

		track.addEventListener('ended', () => {
			console.debug(LOG_PREFIX, 'Audio track ended');
			this.#stopMonitoring();
			if (this.#inCall) {
				this.#updateOverlayState('silent');
			}
		});

		this.#startMonitoring(stream);

		// Send initial microphone state
		this.#sendMicrophoneState(!track.enabled);
	}

	#startMonitoring(stream) {
		try {
			this.#audioContext = new AudioContext();
			this.#analyser = this.#audioContext.createAnalyser();
			this.#analyser.fftSize = 256;
			this.#analyser.smoothingTimeConstant = 0.3;

			this.#source = this.#audioContext.createMediaStreamSource(stream);
			this.#source.connect(this.#analyser);
			// NOT connected to destination - no feedback loop

			this.#dataArray = new Uint8Array(this.#analyser.frequencyBinCount);

			this.#samplingInterval = setInterval(() => this.#sampleAudio(), SAMPLE_INTERVAL_MS);

			// Poll track.enabled for mute detection (validated as reliable)
			this.#pollInterval = setInterval(() => this.#checkMuteState(), 200);

			console.debug(LOG_PREFIX, 'Audio monitoring started');
		} catch (err) {
			console.error(LOG_PREFIX, 'Failed to start monitoring:', err.message);
		}
	}

	#stopMonitoring() {
		if (this.#samplingInterval) {
			clearInterval(this.#samplingInterval);
			this.#samplingInterval = null;
		}

		if (this.#pollInterval) {
			clearInterval(this.#pollInterval);
			this.#pollInterval = null;
		}

		if (this.#source) {
			try { this.#source.disconnect(); } catch { /* already disconnected */ }
			this.#source = null;
		}

		if (this.#audioContext) {
			try { this.#audioContext.close(); } catch { /* already closed */ }
			this.#audioContext = null;
		}

		this.#analyser = null;
		this.#dataArray = null;
		this.#currentTrack = null;
		this.#lastMuteState = null;
	}

	#sampleAudio() {
		if (!this.#analyser || !this.#dataArray || !this.#inCall) {
			return;
		}

		// If muted, show muted state regardless of audio data
		if (this.#currentTrack && !this.#currentTrack.enabled) {
			this.#updateOverlayState('muted');
			return;
		}

		this.#analyser.getByteFrequencyData(this.#dataArray);

		let sumOfSquares = 0;
		for (let i = 0; i < this.#dataArray.length; i++) {
			sumOfSquares += this.#dataArray[i] * this.#dataArray[i];
		}
		const rms = Math.sqrt(sumOfSquares / this.#dataArray.length);

		this.#updateOverlayState(rms > SILENCE_THRESHOLD ? 'speaking' : 'silent');
	}

	#checkMuteState() {
		if (!this.#currentTrack) {
			return;
		}

		const isMuted = !this.#currentTrack.enabled;
		if (isMuted !== this.#lastMuteState) {
			this.#lastMuteState = isMuted;
			this.#sendMicrophoneState(isMuted);
		}
	}

	#sendMicrophoneState(isMuted) {
		try {
			this.#ipcRenderer.send('microphone-state-changed', !isMuted);
		} catch (err) {
			console.debug(LOG_PREFIX, 'Failed to send microphone state:', err.message);
		}
	}

	// --- DOM Overlay ---

	#showOverlay() {
		if (this.#overlayElement) {
			return;
		}

		const overlay = document.createElement('div');
		overlay.id = 'speaking-indicator-overlay';
		overlay.setAttribute('aria-hidden', 'true');

		const style = document.createElement('style');
		style.id = 'speaking-indicator-styles';
		style.textContent = `
			#speaking-indicator-overlay {
				position: fixed;
				bottom: 20px;
				right: 20px;
				width: 24px;
				height: 24px;
				border-radius: 50%;
				pointer-events: none;
				z-index: 999999;
				transition: background-color 0.15s ease, box-shadow 0.15s ease;
				background-color: #555;
				box-shadow: 0 0 0 0 transparent;
			}
			#speaking-indicator-overlay.speaking {
				background-color: #4caf50;
				box-shadow: 0 0 8px 2px rgba(76, 175, 80, 0.6);
				animation: speaking-pulse 1s ease-in-out infinite;
			}
			#speaking-indicator-overlay.silent {
				background-color: #555;
				box-shadow: none;
			}
			#speaking-indicator-overlay.muted {
				background-color: #f44336;
				box-shadow: 0 0 4px 1px rgba(244, 67, 54, 0.4);
			}
			@keyframes speaking-pulse {
				0%, 100% { box-shadow: 0 0 8px 2px rgba(76, 175, 80, 0.6); }
				50% { box-shadow: 0 0 12px 4px rgba(76, 175, 80, 0.3); }
			}
		`;

		document.head.appendChild(style);
		document.body.appendChild(overlay);
		this.#overlayElement = overlay;

		console.debug(LOG_PREFIX, 'Overlay shown');
	}

	#hideOverlay() {
		if (this.#overlayElement) {
			this.#overlayElement.remove();
			this.#overlayElement = null;
		}

		const style = document.getElementById('speaking-indicator-styles');
		if (style) {
			style.remove();
		}

		console.debug(LOG_PREFIX, 'Overlay hidden');
	}

	#updateOverlayState(state) {
		if (!this.#overlayElement) {
			return;
		}

		this.#overlayElement.className = state;
	}
}

module.exports = new SpeakingIndicator();
```

**Step 2: Verify module loads without errors**

Run: `node -e "const m = require('./app/browser/tools/speakingIndicator'); console.log('Module loaded:', typeof m.init)"`
Expected: `Module loaded: function`

**Step 3: Commit**

```
feat: add speakingIndicator browser tool module (#2290)
```

---

## Task 3: Register module in preload.js

**Files:**
- Modify: `app/browser/preload.js:314-331`

**Step 1: Add speakingIndicator to the modules array**

In `app/browser/preload.js`, add to the `modules` array after the `disableAutogain` entry (line ~323):

```javascript
{ name: "speakingIndicator", path: "./tools/speakingIndicator" },
```

**Step 2: Add to modulesRequiringIpc set**

In `app/browser/preload.js`, update the `modulesRequiringIpc` set (line ~331):

```javascript
const modulesRequiringIpc = new Set(["settings", "theme", "trayIconRenderer", "mqttStatusMonitor", "speakingIndicator"]);
```

**Step 3: Add call-connected/call-disconnected to electronAPI (preload.js)**

The speaking indicator needs to listen for call lifecycle events from the main process. Add these listeners to the `electronAPI` object in preload.js, or alternatively wire them through the existing `ActivityManager` pattern. Check which approach fits: the `ActivityManager` already sends `call-connected`/`call-disconnected` via `ipcRenderer.invoke()` TO the main process. The speaking indicator needs to receive these events in the renderer. Since `activityHub.js` emits these events directly in the renderer process, the speaking indicator should listen on `activityHub` directly rather than via IPC round-trip.

Update `speakingIndicator.js` to import `activityHub` and listen there instead:

Replace the `#listenForCallEvents` method:

```javascript
#listenForCallEvents() {
	const activityHub = require('./activityHub');

	activityHub.on('call-connected', () => {
		console.debug(LOG_PREFIX, 'Call connected');
		this.#inCall = true;
		this.#showOverlay();
	});

	activityHub.on('call-disconnected', () => {
		console.debug(LOG_PREFIX, 'Call disconnected');
		this.#inCall = false;
		this.#stopMonitoring();
		this.#hideOverlay();
	});
}
```

This means `speakingIndicator` does NOT need `ipcRenderer` for call events (only for sending `microphone-state-changed`). It still needs to be in `modulesRequiringIpc` for the IPC send.

**Step 4: Commit**

```
feat: register speakingIndicator in preload.js (#2290)
```

---

## Task 4: Add unit tests

**Files:**
- Create: `tests/unit/speakingIndicator.test.js`

**Step 1: Write the tests**

```javascript
'use strict';

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

// Mock browser globals before requiring the module
function createMockTrack() {
	return {
		enabled: true,
		readyState: 'live',
		addEventListener: mock.fn(),
	};
}

function createMockStream(track) {
	return {
		getAudioTracks: () => [track],
	};
}

describe('SpeakingIndicator', () => {
	let speakingIndicator;
	let mockIpcRenderer;
	let mockConfig;

	beforeEach(() => {
		// Fresh module instance for each test
		delete require.cache[require.resolve('../../app/browser/tools/speakingIndicator')];

		mockIpcRenderer = {
			send: mock.fn(),
			on: mock.fn(),
		};

		mockConfig = {
			media: {
				microphone: {
					speakingIndicator: true,
				},
			},
		};

		// Mock DOM globals
		globalThis.document = {
			createElement: mock.fn(() => ({
				id: '',
				className: '',
				setAttribute: mock.fn(),
				remove: mock.fn(),
			})),
			getElementById: mock.fn(() => null),
			head: { appendChild: mock.fn() },
			body: { appendChild: mock.fn() },
		};

		// Mock AudioContext
		globalThis.AudioContext = mock.fn(() => ({
			state: 'running',
			createAnalyser: () => ({
				fftSize: 0,
				smoothingTimeConstant: 0,
				frequencyBinCount: 128,
				getByteFrequencyData: mock.fn(),
				connect: mock.fn(),
			}),
			createMediaStreamSource: () => ({
				connect: mock.fn(),
				disconnect: mock.fn(),
			}),
			close: mock.fn(),
		}));

		// Mock navigator.mediaDevices
		globalThis.navigator = {
			mediaDevices: {
				getUserMedia: mock.fn(() => Promise.resolve(createMockStream(createMockTrack()))),
			},
		};
	});

	it('does not patch getUserMedia when disabled', () => {
		const disabledConfig = { media: { microphone: { speakingIndicator: false } } };
		const originalGum = globalThis.navigator.mediaDevices.getUserMedia;

		speakingIndicator = require('../../app/browser/tools/speakingIndicator');
		speakingIndicator.init(disabledConfig, mockIpcRenderer);

		assert.strictEqual(globalThis.navigator.mediaDevices.getUserMedia, originalGum);
	});

	it('patches getUserMedia when enabled', () => {
		const originalGum = globalThis.navigator.mediaDevices.getUserMedia;

		speakingIndicator = require('../../app/browser/tools/speakingIndicator');
		speakingIndicator.init(mockConfig, mockIpcRenderer);

		assert.notStrictEqual(globalThis.navigator.mediaDevices.getUserMedia, originalGum);
	});

	it('sends microphone-state-changed IPC on stream acquisition', async () => {
		const track = createMockTrack();
		const stream = createMockStream(track);
		globalThis.navigator.mediaDevices.getUserMedia = mock.fn(() => Promise.resolve(stream));

		speakingIndicator = require('../../app/browser/tools/speakingIndicator');
		speakingIndicator.init(mockConfig, mockIpcRenderer);

		await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });

		const sendCalls = mockIpcRenderer.send.mock.calls;
		const micCalls = sendCalls.filter(c => c.arguments[0] === 'microphone-state-changed');
		assert.strictEqual(micCalls.length, 1);
		assert.strictEqual(micCalls[0].arguments[1], true); // enabled = not muted
	});
});
```

**Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests pass, including the new speakingIndicator tests.

**Step 3: Commit**

```
test: add unit tests for speakingIndicator module (#2290)
```

---

## Task 5: Update documentation

**Files:**
- Modify: `docs-site/docs/development/research/speaking-indicator-research.md` (update next steps)
- Modify: `docs-site/docs/development/module-index.md` (add module entry)
- Modify: `docs-site/docs/development/plan/roadmap.md` (mark as implemented)
- Create: `app/browser/tools/README.md` or update if exists (add speakingIndicator entry)

**Step 1: Update roadmap status**

In `docs-site/docs/development/plan/roadmap.md`, change the Speaking Indicator row in the Quick Reference table from `Ready` to `Implemented`.

**Step 2: Update the research doc next steps**

In `docs-site/docs/development/research/speaking-indicator-research.md`, mark step 2 (implement MVP) as done.

**Step 3: Add to module index**

In `docs-site/docs/development/module-index.md`, add an entry for `speakingIndicator` under browser tools.

**Step 4: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 5: Commit**

```
docs: update documentation for speaking indicator feature (#2290)
```

---

## Task 6: Add changelog entry

**Files:**
- Create: `.changelog/pr-XXXX.txt` (use the PR number once created)

**Step 1: Create changelog entry**

```
feat: add speaking indicator overlay for microphone monitoring during calls (#2290)
```

**Step 2: Final verification**

Run: `npm run lint && npm run test:unit`
Expected: All pass.

**Step 3: Commit**

```
chore: add changelog entry for speaking indicator (#2290)
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Config option | `app/config/index.js` |
| 2 | Core module | `app/browser/tools/speakingIndicator.js` |
| 3 | Preload registration | `app/browser/preload.js` |
| 4 | Unit tests | `tests/unit/speakingIndicator.test.js` |
| 5 | Documentation | roadmap, research, module-index |
| 6 | Changelog | `.changelog/pr-XXXX.txt` |

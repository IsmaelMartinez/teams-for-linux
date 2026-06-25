'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const toolPath = require.resolve('../../app/browser/tools/ignoreSystemMute');

// Minimal MediaStreamTrack stub whose `muted`, `onmute` and `onunmute` live on
// the prototype, mirroring how Chromium exposes them, so the per-instance
// patch must shadow them.
class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this._muted = false;
    this._listeners = {};
    this._onmute = null;
  }
  get muted() {
    return this._muted;
  }
  set muted(value) {
    this._muted = value;
  }
  get onmute() {
    return this._onmute;
  }
  set onmute(fn) {
    this._onmute = fn;
  }
  addEventListener(type, listener) {
    (this._listeners[type] ||= []).push(listener);
  }
  // Simulates the OS muting the source: Chromium flips muted and fires 'mute'.
  simulateSystemMute() {
    this._muted = true;
    for (const fn of this._listeners.mute || []) fn();
    if (this._onmute) this._onmute();
  }
}

function makeStream(tracks) {
  return { getAudioTracks: () => tracks.filter((t) => t.kind === 'audio') };
}

let originalGetUserMedia;

function setupGlobals(stream) {
  originalGetUserMedia = () => Promise.resolve(stream);
  // Node 21+ exposes a read-only built-in `navigator`, so define rather than assign.
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: originalGetUserMedia } },
    configurable: true,
    writable: true,
  });
  globalThis.MediaStreamTrack = FakeTrack;
}

function loadTool() {
  delete require.cache[toolPath];
  return require(toolPath);
}

describe('ignoreSystemMute', () => {
  beforeEach(() => {
    globalThis.console = { ...console, debug: () => {}, info: () => {} };
  });

  afterEach(() => {
    delete globalThis.navigator;
    delete globalThis.MediaStreamTrack;
  });

  it('does nothing when the option is disabled', () => {
    const stream = makeStream([new FakeTrack('audio')]);
    setupGlobals(stream);
    loadTool().init({ media: { microphone: { ignoreSystemMute: false } } });
    assert.strictEqual(globalThis.navigator.mediaDevices.getUserMedia, originalGetUserMedia);
  });

  it('keeps muted false and hides mute events on the local audio track', async () => {
    const track = new FakeTrack('audio');
    const stream = makeStream([track]);
    setupGlobals(stream);
    loadTool().init({ media: { microphone: { ignoreSystemMute: true } } });

    // Teams obtains the mic and registers a mute listener.
    const resolved = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
    const [audioTrack] = resolved.getAudioTracks();
    let teamsSawMute = false;
    audioTrack.addEventListener('mute', () => {
      teamsSawMute = true;
    });
    let onmuteFired = false;
    audioTrack.onmute = () => {
      onmuteFired = true;
    };

    // The OS mutes the source.
    audioTrack.simulateSystemMute();

    assert.strictEqual(audioTrack.muted, false, 'muted must read false');
    assert.strictEqual(teamsSawMute, false, 'addEventListener mute must be suppressed');
    assert.strictEqual(onmuteFired, false, 'onmute must be suppressed');
  });

  it('still delivers non-mute events to listeners', async () => {
    const track = new FakeTrack('audio');
    setupGlobals(makeStream([track]));
    loadTool().init({ media: { microphone: { ignoreSystemMute: true } } });

    const [audioTrack] = (await globalThis.navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks();
    let endedSeen = false;
    audioTrack.addEventListener('ended', () => {
      endedSeen = true;
    });
    for (const fn of audioTrack._listeners.ended || []) fn();
    assert.strictEqual(endedSeen, true, 'unrelated events must still fire');
  });

  it('does not patch video tracks', async () => {
    const video = new FakeTrack('video');
    const stream = { getAudioTracks: () => [] , tracks: [video] };
    setupGlobals(stream);
    loadTool().init({ media: { microphone: { ignoreSystemMute: true } } });
    await globalThis.navigator.mediaDevices.getUserMedia({ video: true });
    assert.strictEqual(video.muted, false);
    video.muted = true;
    assert.strictEqual(video.muted, true, 'video track muted must remain writable/native');
  });
});

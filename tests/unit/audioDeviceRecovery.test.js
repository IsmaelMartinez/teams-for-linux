'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const toolPath = require.resolve('../../app/browser/tools/audioDeviceRecovery');

function deviceError(name) {
  const error = new Error(name);
  error.name = name;
  return error;
}

// Minimal EventTarget-like stand-in for navigator.mediaDevices.
class FakeMediaDevices {
  constructor() {
    this.listeners = [];
    this.calls = [];
    this.devices = [];
    this.failFor = new Set();
  }
  addEventListener(type, fn) {
    if (type === 'devicechange') this.listeners.push(fn);
  }
  dispatchEvent(event) {
    for (const fn of this.listeners) fn(event);
    return true;
  }
  enumerateDevices() {
    return Promise.resolve(this.devices);
  }
  getUserMedia(constraints) {
    this.calls.push(constraints);
    const id = constraints?.audio?.deviceId;
    const wanted = typeof id === 'object' && id !== null ? id.exact ?? id.ideal : id;
    if (wanted && this.failFor.has(wanted)) {
      return Promise.reject(deviceError('OverconstrainedError'));
    }
    return Promise.resolve({ label: wanted || 'default' });
  }
}

class FakeMediaElement {
  constructor(missingSinks) {
    this.missingSinks = missingSinks;
    this.sinkIds = [];
  }
  setSinkId(id) {
    this.sinkIds.push(id);
    if (this.missingSinks.has(id)) return Promise.reject(deviceError('NotFoundError'));
    return Promise.resolve();
  }
}

let mediaDevices;
let originalPlatform;
const originalDescriptors = {};

function setupGlobals({ platform = 'linux' } = {}) {
  mediaDevices = new FakeMediaDevices();
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices },
    configurable: true,
    writable: true,
  });
  globalThis.HTMLMediaElement = FakeMediaElement;
  globalThis.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

function loadTool() {
  delete require.cache[toolPath];
  return require(toolPath);
}

const enabledConfig = { media: { audioDeviceRecovery: { enabled: true } } };

describe('audioDeviceRecovery', () => {
  beforeEach(() => {
    for (const name of ['setInterval']) {
      originalDescriptors[name] = globalThis[name];
    }
    // Do not let the watcher leave a live timer behind in the test process.
    globalThis.setInterval = () => ({ unref() {} });
    setupGlobals();
  });

  afterEach(() => {
    const tool = require.cache[toolPath]?.exports;
    if (tool?._internal?.state) {
      tool._internal.state.timer = null;
      tool._internal.state.lastSignature = null;
    }
    delete require.cache[toolPath];
    globalThis.setInterval = originalDescriptors.setInterval;
    Object.defineProperty(process, 'platform', originalPlatform);
    delete globalThis.navigator;
    delete globalThis.HTMLMediaElement;
    delete globalThis.Event;
  });

  describe('constraint helpers', () => {
    it('detects a pinned audio device in modern, advanced and legacy shapes', () => {
      const { hasAudioDeviceId } = loadTool()._internal;
      assert.equal(hasAudioDeviceId({ audio: true }), false);
      assert.equal(hasAudioDeviceId({ audio: { echoCancellation: true } }), false);
      assert.equal(hasAudioDeviceId({ video: { deviceId: 'cam' } }), false);
      assert.equal(hasAudioDeviceId({ audio: { deviceId: 'abc' } }), true);
      assert.equal(hasAudioDeviceId({ audio: { deviceId: { exact: 'abc' } } }), true);
      assert.equal(hasAudioDeviceId({ audio: { advanced: [{ deviceId: 'abc' }] } }), true);
      assert.equal(hasAudioDeviceId({ audio: { mandatory: { sourceId: 'abc' } } }), true);
      assert.equal(hasAudioDeviceId({ audio: { optional: [{ sourceId: 'abc' }] } }), true);
    });

    it('strips the device pin but keeps every other constraint', () => {
      const { stripAudioDeviceId } = loadTool()._internal;
      const original = {
        audio: {
          deviceId: { exact: 'abc' },
          groupId: 'grp',
          echoCancellation: false,
          advanced: [{ deviceId: 'abc' }, { sampleRate: 48000 }],
          mandatory: { sourceId: 'abc', googEchoCancellation: false },
          optional: [{ sourceId: 'abc' }, { googNoiseSuppression: true }],
        },
        video: { deviceId: 'cam' },
      };
      const stripped = stripAudioDeviceId(original);
      assert.deepEqual(stripped, {
        audio: {
          echoCancellation: false,
          advanced: [{ sampleRate: 48000 }],
          mandatory: { googEchoCancellation: false },
          optional: [{ googNoiseSuppression: true }],
        },
        video: { deviceId: 'cam' },
      });
      // The original request object is left untouched for the first attempt.
      assert.deepEqual(original.audio.deviceId, { exact: 'abc' });
    });

    it('only treats device-availability errors as recoverable', () => {
      const { isDeviceError } = loadTool()._internal;
      for (const name of ['NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError']) {
        assert.equal(isDeviceError(deviceError(name)), true, name);
      }
      assert.equal(isDeviceError(deviceError('NotAllowedError')), false);
      assert.equal(isDeviceError(deviceError('SecurityError')), false);
      assert.equal(isDeviceError(undefined), false);
    });
  });

  describe('init gating', () => {
    it('does nothing when disabled', () => {
      const before = mediaDevices.getUserMedia;
      loadTool().init({ media: { audioDeviceRecovery: { enabled: false } } });
      assert.equal(mediaDevices.getUserMedia, before);
      assert.equal(mediaDevices.listeners.length, 0);
    });

    it('does nothing off Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const before = mediaDevices.getUserMedia;
      loadTool().init(enabledConfig);
      assert.equal(mediaDevices.getUserMedia, before);
    });

    it('skips the device watcher when preventDeviceSwitching is on', () => {
      const before = mediaDevices.getUserMedia;
      loadTool().init({ media: { audioDeviceRecovery: { enabled: true }, preventDeviceSwitching: true } });
      assert.notEqual(mediaDevices.getUserMedia, before, 'getUserMedia is still wrapped');
      assert.equal(mediaDevices.listeners.length, 0, 'no devicechange listener registered');
    });
  });

  describe('getUserMedia recovery', () => {
    it('passes a successful pinned request straight through', async () => {
      loadTool().init(enabledConfig);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'bt-mic' } } });
      assert.equal(stream.label, 'bt-mic');
      assert.equal(mediaDevices.calls.length, 1);
    });

    it('retries without the device id when the pinned microphone is gone', async () => {
      mediaDevices.failFor.add('bt-mic');
      loadTool().init(enabledConfig);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: 'bt-mic' }, noiseSuppression: false },
        video: false,
      });
      assert.equal(stream.label, 'default');
      assert.equal(mediaDevices.calls.length, 2);
      assert.deepEqual(mediaDevices.calls[1], { audio: { noiseSuppression: false }, video: false });
    });

    it('rethrows the original error when the fallback fails too', async () => {
      mediaDevices.failFor.add('bt-mic');
      mediaDevices.getUserMedia = () => Promise.reject(deviceError('NotReadableError'));
      loadTool().init(enabledConfig);
      await assert.rejects(
        navigator.mediaDevices.getUserMedia({ audio: { deviceId: 'bt-mic' } }),
        (error) => error.name === 'NotReadableError'
      );
    });

    it('does not retry permission denials', async () => {
      mediaDevices.getUserMedia = () => {
        mediaDevices.calls.push('call');
        return Promise.reject(deviceError('NotAllowedError'));
      };
      loadTool().init(enabledConfig);
      await assert.rejects(
        navigator.mediaDevices.getUserMedia({ audio: { deviceId: 'bt-mic' } }),
        (error) => error.name === 'NotAllowedError'
      );
      assert.equal(mediaDevices.calls.length, 1);
    });

    it('does not retry requests that never pinned a device', async () => {
      mediaDevices.getUserMedia = () => {
        mediaDevices.calls.push('call');
        return Promise.reject(deviceError('NotFoundError'));
      };
      loadTool().init(enabledConfig);
      await assert.rejects(navigator.mediaDevices.getUserMedia({ audio: true }));
      assert.equal(mediaDevices.calls.length, 1);
    });
  });

  describe('setSinkId recovery', () => {
    it('falls back to the default output when the sink is missing', async () => {
      loadTool().init(enabledConfig);
      const element = new HTMLMediaElement(new Set(['bt-speaker']));
      await element.setSinkId('bt-speaker');
      assert.deepEqual(element.sinkIds, ['bt-speaker', '']);
    });

    it('leaves working sinks and default requests alone', async () => {
      loadTool().init(enabledConfig);
      const element = new HTMLMediaElement(new Set());
      await element.setSinkId('usb');
      await element.setSinkId('');
      assert.deepEqual(element.sinkIds, ['usb', '']);
    });
  });

  describe('device watcher', () => {
    it('dispatches a synthetic devicechange only when the list changes', async () => {
      loadTool().init(enabledConfig);
      const received = [];
      mediaDevices.addEventListener('devicechange', (event) => received.push(event.type));
      const tool = require.cache[toolPath].exports;

      mediaDevices.devices = [{ kind: 'audioinput', deviceId: 'a', label: 'Built-in' }];
      await tool._internal.checkForDeviceChanges(false); // baseline snapshot
      await tool._internal.checkForDeviceChanges(true);
      assert.deepEqual(received, [], 'unchanged list is silent');

      mediaDevices.devices = [
        { kind: 'audioinput', deviceId: 'a', label: 'Built-in' },
        { kind: 'audioinput', deviceId: 'b', label: 'Headset' },
      ];
      await tool._internal.checkForDeviceChanges(true);
      assert.deepEqual(received, ['devicechange']);

      mediaDevices.devices = [{ kind: 'audioinput', deviceId: 'a', label: 'Built-in' }];
      await tool._internal.checkForDeviceChanges(true);
      assert.deepEqual(received, ['devicechange', 'devicechange'], 'removal is reported too');
    });

    it('resyncs silently after a genuine browser devicechange', async () => {
      loadTool().init(enabledConfig);
      const tool = require.cache[toolPath].exports;
      mediaDevices.devices = [{ kind: 'audioinput', deviceId: 'a', label: 'Built-in' }];
      await tool._internal.checkForDeviceChanges(false);
      mediaDevices.devices = [{ kind: 'audioinput', deviceId: 'b', label: 'USB' }];
      // The tool's own listener was registered by init(); fire the event.
      mediaDevices.dispatchEvent(new Event('devicechange'));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(tool._internal.state.lastSignature, tool._internal.deviceSignature(mediaDevices.devices));
    });
  });
});

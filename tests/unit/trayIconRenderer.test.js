'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const rendererPath = require.resolve('../../app/browser/tools/trayIconRenderer');

describe('trayIconRenderer base icon cache', () => {
  beforeEach(() => {
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: { nativeImage: {} },
    };
    delete require.cache[rendererPath];
    // render() touches DOM globals; minimal stubs suffice because the
    // returned promise is simply left pending (image.onload never fires).
    globalThis.document = { createElement: () => ({}) };
    globalThis.Image = class {};
  });

  afterEach(() => {
    delete require.cache[electronPath];
    delete require.cache[rendererPath];
    delete globalThis.document;
    delete globalThis.Image;
  });

  it('encodes the base icon to a data URL only once across renders', () => {
    const renderer = require(rendererPath);
    let toDataURLCalls = 0;
    renderer.baseIcon = {
      toDataURL: () => {
        toDataURLCalls += 1;
        return 'data:image/png;base64,TEST';
      },
    };
    renderer.config = {};

    renderer.render(1);
    renderer.render(2);

    assert.strictEqual(toDataURLCalls, 1);
  });
});

describe('trayIconRenderer badge toggles', () => {
  beforeEach(() => {
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: { nativeImage: {} },
    };
    delete require.cache[rendererPath];
  });

  afterEach(() => {
    delete require.cache[electronPath];
    delete require.cache[rendererPath];
    delete globalThis.document;
  });

  function drawWithConfig(config) {
    const renderer = require(rendererPath);
    renderer.config = config;
    renderer.iconSize = { width: 16, height: 16 };

    const drawn = [];
    const ctx = new Proxy({}, {
      get: (_target, prop) => (...args) => drawn.push({ prop, args }),
      set: () => true,
    });
    globalThis.document = {
      createElement: () => ({
        getContext: () => ({ scale: () => {}, drawImage: () => {} }),
        toDataURL: () => 'data:resized',
      }),
    };

    let resolved;
    renderer._addRedCircleNotification(
      { getContext: () => ctx },
      {},
      3,
      (value) => { resolved = value; },
    );
    return { drawn, resolved };
  }

  it('skips the count circle when notifications.trayBadgeEnabled is false', () => {
    const { drawn, resolved } = drawWithConfig({
      notifications: { trayBadgeEnabled: false },
    });
    assert.ok(!drawn.some((call) => call.prop === 'fillText'));
    assert.strictEqual(resolved, 'data:resized');
  });

  it('still honours the legacy disableBadgeCount master switch', () => {
    const { drawn } = drawWithConfig({ disableBadgeCount: true });
    assert.ok(!drawn.some((call) => call.prop === 'fillText'));
  });

  it('draws the count circle by default', () => {
    const { drawn } = drawWithConfig({});
    assert.ok(drawn.some((call) => call.prop === 'fillText'));
  });

  it('always forwards the count so the main process can apply its toggles', async () => {
    const renderer = require(rendererPath);
    const invocations = [];
    renderer.config = { disableBadgeCount: true };
    renderer.ipcRenderer = {
      send: () => {},
      invoke: (...args) => {
        invocations.push(args);
        return Promise.resolve();
      },
    };

    await renderer.updateActivityCount({ detail: { number: 0 } });

    assert.deepStrictEqual(invocations, [['set-badge-count', 0]]);
  });
});

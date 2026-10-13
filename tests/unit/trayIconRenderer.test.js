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

describe('trayIconRenderer appIcon config changes', () => {
  let createdPaths;
  let handler;
  let dataUrlCalls;

  const fakeIcon = () => ({
    getSize: () => ({ width: 96, height: 96 }),
    toDataURL: () => {
      dataUrlCalls += 1;
      return 'data:image/png;base64,TEST';
    },
  });

  beforeEach(() => {
    createdPaths = [];
    handler = null;
    dataUrlCalls = 0;
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        nativeImage: {
          createFromPath: (p) => {
            createdPaths.push(p);
            return fakeIcon();
          },
        },
      },
    };
    delete require.cache[rendererPath];
    globalThis.addEventListener = () => {};
  });

  afterEach(() => {
    delete require.cache[electronPath];
    delete require.cache[rendererPath];
    delete globalThis.addEventListener;
  });

  const initRenderer = () => {
    const renderer = require(rendererPath);
    renderer.init(
      { appIcon: '/old/icon.png', appIconType: 'default' },
      { on: (channel, cb) => { if (channel === 'config-changed') handler = cb; } },
    );
    return renderer;
  };

  it('rebuilds the base icon from the incoming path, not the stale config', () => {
    initRenderer();
    createdPaths.length = 0;

    handler(null, { appIcon: '/new/icon.png' });

    assert.deepStrictEqual(createdPaths, ['/new/icon.png']);
  });

  it('ignores a config-changed payload that does not move appIcon', () => {
    initRenderer();
    createdPaths.length = 0;

    handler(null, { appIcon: '/old/icon.png', someOtherToggle: true });

    assert.deepStrictEqual(createdPaths, []);
  });

  it('drops the cached data URL so the badge renders on the new icon', () => {
    globalThis.document = { createElement: () => ({}) };
    globalThis.Image = class {};
    try {
      const renderer = initRenderer();
      renderer.render(1);
      const encodedBeforeChange = dataUrlCalls;

      handler(null, { appIcon: '/new/icon.png' });
      renderer.render(2);

      assert.strictEqual(encodedBeforeChange, 1);
      assert.strictEqual(dataUrlCalls, 2);
    } finally {
      delete globalThis.document;
      delete globalThis.Image;
    }
  });

  it('rebuilds the base icon when appIconDark moves', () => {
    initRenderer();
    createdPaths.length = 0;

    handler(null, { appIconDark: '/new/dark.png', theme: 'dark' });

    assert.deepStrictEqual(createdPaths, ['/new/dark.png']);
  });

  it('rebuilds the base icon when theme changes with appIconDark set', () => {
    const renderer = require(rendererPath);
    renderer.init(
      { appIcon: '/custom/light.png', appIconDark: '/custom/dark.png', appIconType: 'default', theme: 'light' },
      { on: (channel, cb) => { if (channel === 'config-changed') handler = cb; } },
    );
    createdPaths.length = 0;

    handler(null, { theme: 'dark' });

    assert.deepStrictEqual(createdPaths, ['/custom/dark.png']);
  });

  it('preserves the shared config object reference on config-changed', () => {
    const sharedConfig = { appIcon: '/custom/icon.png', appIconType: 'default' };
    const renderer = require(rendererPath);
    renderer.init(
      sharedConfig,
      { on: (channel, cb) => { if (channel === 'config-changed') handler = cb; } },
    );

    handler(null, { appIcon: '/updated/icon.png', disableBadgeCount: true });

    assert.strictEqual(renderer.config, sharedConfig);
    assert.strictEqual(sharedConfig.appIcon, '/updated/icon.png');
  });

  it('triggers an activity count redraw when base icon changes with an active count without altering flash state', async () => {
    const sentUpdates = [];
    const renderer = require(rendererPath);
    renderer.init(
      { appIcon: '/old/icon.png', appIconType: 'default', disableBadgeCount: true },
      {
        on: (channel, cb) => { if (channel === 'config-changed') handler = cb; },
        send: (channel, data) => { if (channel === 'tray-update') sentUpdates.push(data); },
      },
    );
    renderer.render = async () => 'data:image/png;base64,STUB';

    await renderer.updateActivityCount({ detail: { number: 4 } });
    assert.strictEqual(sentUpdates.length, 1);
    assert.strictEqual(sentUpdates[0].count, 4);
    assert.strictEqual(sentUpdates[0].flash, true);

    sentUpdates.length = 0;
    handler(null, { appIcon: '/another/icon.png' });

    // Allow the microtask queue to process updateActivityCount
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(sentUpdates.length, 1);
    assert.strictEqual(sentUpdates[0].count, 4);
    // Redraw leaves flash undefined so updateTrayImage does not alter flashFrame state
    assert.strictEqual(sentUpdates[0].flash, undefined);
  });

  it('preserves pending notification flash when base icon changes while notification is rendering', async () => {
    const sentUpdates = [];
    const renderer = require(rendererPath);
    renderer.init(
      { appIcon: '/old/icon.png', appIconType: 'default', disableBadgeCount: true },
      {
        on: (channel, cb) => { if (channel === 'config-changed') handler = cb; },
        send: (channel, data) => { if (channel === 'tray-update') sentUpdates.push(data); },
      },
    );

    let resolveFirstRender;
    let renderCount = 0;
    renderer.render = () => {
      renderCount += 1;
      if (renderCount === 1) {
        return new Promise((resolve) => { resolveFirstRender = resolve; });
      }
      return Promise.resolve('data:image/png;base64,STUB2');
    };

    // Start a notification render that stays pending
    const notificationPromise = renderer.updateActivityCount({ detail: { number: 3 } });

    // While the notification is rendering, base icon changes
    handler(null, { appIcon: '/new/icon.png' });

    // Resolve the first render (which will be discarded as superseded)
    resolveFirstRender('data:image/png;base64,STUB1');
    await notificationPromise;

    // Allow redraw to complete
    await new Promise((resolve) => setImmediate(resolve));

    // The redraw superseding the pending notification preserves flash: true
    assert.strictEqual(sentUpdates.length, 1);
    assert.strictEqual(sentUpdates[0].count, 3);
    assert.strictEqual(sentUpdates[0].flash, true);
  });

  it('initializes baseIcon using system dark theme when config.theme is omitted', () => {
    globalThis.window = { matchMedia: (query) => ({ matches: query.includes('dark') }) };
    try {
      const renderer = require(rendererPath);
      renderer.init(
        { appIcon: '/custom/light.png', appIconDark: '/custom/dark.png', appIconType: 'default' },
        { on: () => {} },
      );

      assert.deepStrictEqual(createdPaths, ['/custom/dark.png']);
      assert.strictEqual(renderer.currentTheme, 'dark');
    } finally {
      delete globalThis.window;
    }
  });
});


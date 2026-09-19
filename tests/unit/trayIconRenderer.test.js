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
});

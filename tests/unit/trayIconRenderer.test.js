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

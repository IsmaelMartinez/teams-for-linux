'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const TrayIconChooser = require('../../app/browser/tools/trayIconChooser');

const defaultsTo = (config) =>
  path.basename(new TrayIconChooser(config).getFile());

describe('trayIconChooser appIcon resolution', () => {
  it('returns the custom icon when one is set', () => {
    const chooser = new TrayIconChooser({
      appIcon: '/custom/icon.png',
      appIconType: 'default',
    });
    assert.strictEqual(chooser.getFile(), '/custom/icon.png');
  });

  it('falls back to the bundled icon for empty and whitespace paths', () => {
    for (const appIcon of ['', '   ']) {
      assert.match(defaultsTo({ appIcon, appIconType: 'default' }), /^icon-/);
    }
  });

  // A config.json with an explicit "appIcon": null bypasses the yargs default,
  // which used to throw on .trim() and take the whole app down at startup.
  it('falls back instead of throwing when appIcon is null or undefined', () => {
    for (const appIcon of [null, undefined]) {
      assert.match(defaultsTo({ appIcon, appIconType: 'default' }), /^icon-/);
    }
  });
});

describe('trayIconChooser windowImage', () => {
  const electronPath = require.resolve('electron');
  const chooserPath = require.resolve('../../app/browser/tools/trayIconChooser');
  const fakeImage = (width, height) => ({
    getSize: () => ({ width, height }),
    resize: (opts) => ({ resized: opts }),
  });
  const withImage = (image) => {
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: { nativeImage: { createFromPath: () => image } },
    };
    delete require.cache[chooserPath];
    try {
      return require(chooserPath).windowImage('/any.png');
    } finally {
      delete require.cache[electronPath];
      delete require.cache[chooserPath];
    }
  };

  it('passes images of 128px or smaller through untouched', () => {
    const image = fakeImage(96, 96);
    assert.strictEqual(withImage(image), image);
  });

  it('caps larger images on their longer side', () => {
    assert.deepStrictEqual(withImage(fakeImage(250, 264)), { resized: { height: 128 } });
    assert.deepStrictEqual(withImage(fakeImage(512, 256)), { resized: { width: 128 } });
  });
});

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

describe('trayIconChooser appIconDark resolution', () => {
  it('returns appIconDark when theme is dark', () => {
    const chooser = new TrayIconChooser({
      appIcon: '/custom/light.png',
      appIconDark: '/custom/dark.png',
      appIconType: 'default',
    });
    assert.strictEqual(chooser.getFile('dark'), '/custom/dark.png');
    assert.strictEqual(chooser.getFile(true), '/custom/dark.png');
  });

  it('returns appIcon when theme is light', () => {
    const chooser = new TrayIconChooser({
      appIcon: '/custom/light.png',
      appIconDark: '/custom/dark.png',
      appIconType: 'default',
    });
    assert.strictEqual(chooser.getFile('light'), '/custom/light.png');
    assert.strictEqual(chooser.getFile(false), '/custom/light.png');
  });

  it('falls back to appIcon in dark mode if appIconDark is unset', () => {
    const chooser = new TrayIconChooser({
      appIcon: '/custom/light.png',
      appIconType: 'default',
    });
    assert.strictEqual(chooser.getFile('dark'), '/custom/light.png');
  });

  it('falls back to bundled icon in light mode if only appIconDark is set', () => {
    const chooser = new TrayIconChooser({
      appIconDark: '/custom/dark.png',
      appIconType: 'default',
    });
    assert.strictEqual(chooser.getFile('dark'), '/custom/dark.png');
    assert.match(path.basename(chooser.getFile('light')), /^icon-(16x16|96x96)\.png/);
  });

  it('falls back instead of throwing when appIconDark is empty, whitespace, null, or undefined', () => {
    for (const appIconDark of ['', '   ', null, undefined]) {
      const chooser = new TrayIconChooser({
        appIcon: '/custom/light.png',
        appIconDark,
        appIconType: 'default',
      });
      assert.strictEqual(chooser.getFile('dark'), '/custom/light.png');
    }
  });

  it('preserves appIconType bundled icon across themes when appIconDark is unset', () => {
    const defaultChooser = new TrayIconChooser({ appIconType: 'default' });
    assert.match(path.basename(defaultChooser.getFile('dark')), /^icon-(16x16|96x96)\.png/);
    assert.match(path.basename(defaultChooser.getFile('light')), /^icon-(16x16|96x96)\.png/);
    assert.match(path.basename(defaultChooser.getFile()), /^icon-(16x16|96x96)\.png/);

    const darkChooser = new TrayIconChooser({ appIconType: 'dark' });
    assert.match(path.basename(darkChooser.getFile('dark')), /^icon-monochrome-dark-/);
    assert.match(path.basename(darkChooser.getFile('light')), /^icon-monochrome-dark-/);
  });
});

describe('trayIconChooser getWindowFile', () => {
  it('returns appIcon when set', () => {
    const chooser = new TrayIconChooser({
      appIcon: '/custom/window.png',
      appIconDark: '/custom/dark-tray.png',
      appIconType: 'default',
    });
    assert.strictEqual(chooser.getWindowFile(), '/custom/window.png');
  });

  it('ignores appIconDark and falls back to bundled icon for window', () => {
    const chooser = new TrayIconChooser({
      appIconDark: '/custom/dark-tray.png',
      appIconType: 'default',
    });
    assert.match(path.basename(chooser.getWindowFile()), /^icon-(16x16|96x96)\.png/);
  });

  it('returns bundled icon matching appIconType when appIcon is unset', () => {
    const chooser = new TrayIconChooser({ appIconType: 'dark' });
    assert.match(path.basename(chooser.getWindowFile()), /^icon-monochrome-dark-/);
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

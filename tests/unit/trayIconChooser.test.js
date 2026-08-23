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

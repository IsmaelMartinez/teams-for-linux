'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { resolveToastOptions, DEFAULTS } = require('../../app/notificationSystem/toastOptions');
const { calculatePosition } = require('../../app/utils/windowPositioner');
const options = require('../../app/config/options');

describe('customNotification options', () => {
  // #2842: a config that sets one leaf replaces the object, and only leaves
  // declared in the option's `default` are filled back in on load.
  it('declares a default for every field, matching the resolver defaults', () => {
    const option = options.customNotification;
    assert.deepStrictEqual(Object.keys(option.default).sort(), Object.keys(option.fields).sort());
    assert.deepStrictEqual(option.default, { ...DEFAULTS });
  });

  it('keeps today\'s toast when nothing is set', () => {
    const resolved = resolveToastOptions(undefined);
    assert.strictEqual(resolved.toastDuration, 5000);
    assert.strictEqual(resolved.width, 360);
    assert.strictEqual(resolved.height, 110);
    assert.strictEqual(resolved.position, 'bottomRight');
    assert.strictEqual(resolved.margin, 0);
  });

  it('uses valid values as given', () => {
    const resolved = resolveToastOptions({
      toastDuration: 8000,
      width: 440,
      height: 150,
      position: 'topRight',
      margin: 46,
      backgroundColor: '#5B5FC7',
      bodyFontSize: 15,
    });
    assert.strictEqual(resolved.toastDuration, 8000);
    assert.strictEqual(resolved.width, 440);
    assert.strictEqual(resolved.height, 150);
    assert.strictEqual(resolved.position, 'topRight');
    assert.strictEqual(resolved.margin, 46);
    assert.strictEqual(resolved.style.backgroundColor, '#5B5FC7');
    assert.strictEqual(resolved.style.bodyFontSize, 15);
  });

  it('clamps sizes and falls back on invalid values', () => {
    const resolved = resolveToastOptions({
      toastDuration: -1,
      width: 10,
      height: 5000,
      position: 'middle',
      margin: '20',
      backgroundColor: '   ',
      titleFontSize: Number.NaN,
    });
    assert.strictEqual(resolved.toastDuration, 5000);
    assert.strictEqual(resolved.width, 200);
    assert.strictEqual(resolved.height, 600);
    assert.strictEqual(resolved.position, 'bottomRight');
    assert.strictEqual(resolved.margin, 0);
    assert.strictEqual(resolved.style.backgroundColor, DEFAULTS.backgroundColor);
    assert.strictEqual(resolved.style.titleFontSize, DEFAULTS.titleFontSize);
  });
});

describe('windowPositioner calculatePosition', () => {
  const workArea = { x: 1920, y: 0, width: 1920, height: 1040 };
  const bounds = { width: 360, height: 110 };

  it('places each corner inside the work area, keeping the margin', () => {
    assert.deepStrictEqual(calculatePosition('bottomRight', workArea, bounds, 12), { x: 3468, y: 918 });
    assert.deepStrictEqual(calculatePosition('topRight', workArea, bounds, 12), { x: 3468, y: 12 });
    assert.deepStrictEqual(calculatePosition('bottomLeft', workArea, bounds, 12), { x: 1932, y: 918 });
    assert.deepStrictEqual(calculatePosition('topLeft', workArea, bounds, 12), { x: 1932, y: 12 });
  });

  it('matches the old placement without a margin', () => {
    assert.deepStrictEqual(calculatePosition('bottomRight', workArea, bounds), { x: 3480, y: 930 });
  });

  it('returns null for an unknown position', () => {
    assert.strictEqual(calculatePosition('centre', workArea, bounds), null);
  });

  it('keeps a toast inside the work area when the margin is larger than the space left', () => {
    const small = { x: 0, y: 0, width: 1280, height: 720 };
    const big = { width: 1000, height: 600 };
    // Without clamping these would be (-220, -380), cutting off the title.
    assert.deepStrictEqual(calculatePosition('bottomRight', small, big, 500), { x: 0, y: 0 });
    assert.deepStrictEqual(calculatePosition('topLeft', small, big, 500), { x: 280, y: 120 });
  });

  it('keeps the clamped toast on the right display of a multi-monitor work area', () => {
    const big = { width: 1000, height: 600 };
    assert.deepStrictEqual(calculatePosition('bottomRight', workArea, big, 2000), { x: 1920, y: 0 });
  });

  it('aligns a toast larger than the work area to its top-left edge', () => {
    const small = { x: 0, y: 0, width: 1280, height: 720 };
    const huge = { width: 1500, height: 900 };
    for (const position of ['bottomRight', 'topRight', 'bottomLeft', 'topLeft']) {
      assert.deepStrictEqual(calculatePosition(position, small, huge, 12), { x: 0, y: 0 }, position);
    }
  });
});

describe('notificationToast.html styling', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../app/notificationSystem/notificationToast.html'),
    'utf8',
  );

  it('reads every colour and font size from a CSS custom property', () => {
    for (const property of [
      '--toast-background', '--toast-hover-background', '--toast-title-color',
      '--toast-text-color', '--toast-title-font-size', '--toast-body-font-size',
    ]) {
      assert.match(html, new RegExp(`var\\(${property}\\)`), property);
    }
  });

  it('validates colours before applying them', () => {
    assert.match(html, /CSS\.supports\('color', value\)/);
    assert.match(html, /style\.setProperty\(property, value\)/);
  });

  it('enables transitions only after the init style is applied', () => {
    const bodyRule = /\n\s*body \{([^}]*)\}/.exec(html)[1];
    assert.doesNotMatch(bodyRule, /transition/, 'a custom background would fade in from the default');
    assert.match(html, /body\.ready \{[^}]*transition:/);
    assert.match(html, /applyStyle\(style\);[\s\S]*classList\.add\('ready'\)/);
    assert.match(html, /classList\.add\('ready'\);\s*globalThis\.notificationApi\.notifyReady\(\);/, 'ack only after the style is applied');
  });
});

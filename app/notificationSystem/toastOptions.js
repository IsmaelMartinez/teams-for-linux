'use strict';

// Resolves the `customNotification` config into the values NotificationToast
// uses. Pure data module, no Electron imports, so it can be unit tested
// directly. Every leaf has a declared default in app/config/options.js; the
// fallbacks here only cover invalid values (wrong type, out of range).

const POSITIONS = ['bottomRight', 'topRight', 'bottomLeft', 'topLeft'];

const DEFAULTS = Object.freeze({
  toastDuration: 5000,
  width: 360,
  height: 110,
  position: 'bottomRight',
  margin: 0,
  backgroundColor: '#2D2D2D',
  hoverBackgroundColor: '#3A3A3A',
  titleColor: '#FFFFFF',
  textColor: '#D1D1D1',
  titleFontSize: 14,
  bodyFontSize: 13,
});

const LIMITS = Object.freeze({
  width: [200, 1000],
  height: [80, 600],
  margin: [0, 500],
  titleFontSize: [8, 40],
  bodyFontSize: [8, 40],
});

function number(value, fallback, [min, max] = [1, Infinity]) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// Colours are checked again in the toast page with CSS.supports(); here we
// only make sure a non-empty string reaches it.
function color(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * @param {Record<string, unknown> | undefined} customNotification the parsed option.
 * @returns {{
 *   toastDuration: number, width: number, height: number,
 *   position: string, margin: number,
 *   style: Record<string, string | number>
 * }}
 */
function resolveToastOptions(customNotification) {
  const c = customNotification && typeof customNotification === 'object' ? customNotification : {};
  const toastDuration =
    typeof c.toastDuration === 'number' && c.toastDuration > 0 ? c.toastDuration : DEFAULTS.toastDuration;

  return {
    toastDuration,
    width: number(c.width, DEFAULTS.width, LIMITS.width),
    height: number(c.height, DEFAULTS.height, LIMITS.height),
    position: POSITIONS.includes(c.position) ? c.position : DEFAULTS.position,
    margin: number(c.margin, DEFAULTS.margin, LIMITS.margin),
    style: {
      backgroundColor: color(c.backgroundColor, DEFAULTS.backgroundColor),
      hoverBackgroundColor: color(c.hoverBackgroundColor, DEFAULTS.hoverBackgroundColor),
      titleColor: color(c.titleColor, DEFAULTS.titleColor),
      textColor: color(c.textColor, DEFAULTS.textColor),
      titleFontSize: number(c.titleFontSize, DEFAULTS.titleFontSize, LIMITS.titleFontSize),
      bodyFontSize: number(c.bodyFontSize, DEFAULTS.bodyFontSize, LIMITS.bodyFontSize),
    },
  };
}

module.exports = { resolveToastOptions, DEFAULTS, POSITIONS };

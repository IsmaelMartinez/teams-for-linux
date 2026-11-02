'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
	isIntegratedTitleBar,
	titleBarWindowOptions,
	sanitizeOverlayUpdate,
	DEFAULT_HEIGHT,
} = require('../../app/mainAppWindow/titleBar');
const renderer = require('../../app/browser/tools/integratedTitleBar');

const integrated = { frame: true, window: { titleBar: 'integrated' } };

describe('isIntegratedTitleBar', () => {
	it('is on for "integrated" on Linux and Windows', () => {
		assert.strictEqual(isIntegratedTitleBar(integrated, 'linux'), true);
		assert.strictEqual(isIntegratedTitleBar(integrated, 'win32'), true);
	});

	it('is off by default, on macOS and for a frameless window', () => {
		assert.strictEqual(isIntegratedTitleBar({ frame: true, window: { titleBar: 'system' } }, 'linux'), false);
		assert.strictEqual(isIntegratedTitleBar({}, 'linux'), false);
		assert.strictEqual(isIntegratedTitleBar(integrated, 'darwin'), false);
		assert.strictEqual(isIntegratedTitleBar({ ...integrated, frame: false }, 'linux'), false);
	});
});

describe('titleBarWindowOptions', () => {
	it('adds nothing when the integrated title bar is off', () => {
		assert.deepStrictEqual(titleBarWindowOptions({ frame: true }, false, 'linux'), {});
	});

	it('hides the title bar and draws the controls on a transparent overlay', () => {
		const dark = titleBarWindowOptions(integrated, true, 'linux');
		assert.strictEqual(dark.titleBarStyle, 'hidden');
		assert.strictEqual(dark.titleBarOverlay.height, DEFAULT_HEIGHT);
		assert.strictEqual(dark.titleBarOverlay.color, '#00000000');
		assert.strictEqual(dark.titleBarOverlay.symbolColor, '#ffffff');
		// A light page needs a light (if transparent) base colour, or the
		// hover background derived from it turns dark under dark glyphs.
		const light = titleBarWindowOptions(integrated, false, 'linux');
		assert.strictEqual(light.titleBarOverlay.color, '#ffffff00');
		assert.notStrictEqual(light.titleBarOverlay.symbolColor, '#ffffff');
	});
});

describe('sanitizeOverlayUpdate', () => {
	it('accepts a well-formed update and makes the page colour transparent', () => {
		assert.deepStrictEqual(
			sanitizeOverlayUpdate({ height: 48, color: '#ebebeb', symbolColor: '#242424', extra: 1 }),
			{ height: 48, color: '#ebebeb00', symbolColor: '#242424' }
		);
	});

	for (const [label, payload] of [
		['null', null],
		['a string', 'x'],
		['a fractional height', { height: 48.5, color: '#000000', symbolColor: '#ffffff' }],
		['a too-small height', { height: 4, color: '#000000', symbolColor: '#ffffff' }],
		['a too-large height', { height: 500, color: '#000000', symbolColor: '#ffffff' }],
		['a missing page colour', { height: 48, symbolColor: '#ffffff' }],
		['a page colour with its own alpha', { height: 48, color: '#ffffffff', symbolColor: '#242424' }],
		['a CSS expression colour', { height: 48, color: '#000000', symbolColor: 'url(x)' }],
		['a short hex symbol colour', { height: 48, color: '#000000', symbolColor: '#fff' }],
	]) {
		it(`rejects ${label}`, () => {
			assert.strictEqual(sanitizeOverlayUpdate(payload), null);
		});
	}
});

describe('integratedTitleBar renderer helpers', () => {
	const { isEnabled, parseRgb, toHex, isDark } = renderer._internals;

	it('matches the main-process enable rule on this platform', () => {
		assert.strictEqual(isEnabled(integrated), process.platform !== 'darwin');
		assert.strictEqual(isEnabled({ ...integrated, frame: false }), false);
		assert.strictEqual(isEnabled({ window: { titleBar: 'system' } }), false);
	});

	it('parses computed colours, including alpha', () => {
		assert.deepStrictEqual(parseRgb('rgb(31, 31, 31)'), { r: 31, g: 31, b: 31, a: 1 });
		assert.deepStrictEqual(parseRgb('rgba(0, 0, 0, 0)'), { r: 0, g: 0, b: 0, a: 0 });
		assert.strictEqual(parseRgb('transparent'), null);
	});

	it('converts to hex and picks glyph contrast from the background', () => {
		assert.strictEqual(toHex({ r: 31, g: 0, b: 255 }), '#1f00ff');
		assert.strictEqual(isDark({ r: 31, g: 31, b: 31 }), true);
		assert.strictEqual(isDark({ r: 235, g: 235, b: 235 }), false);
	});

	it('follows the system colour scheme when the page colour is unreadable', () => {
		const { schemeFallback } = renderer._internals;
		const media = (dark) => (query) => ({ matches: dark && query === '(prefers-color-scheme: dark)' });
		assert.strictEqual(isDark(schemeFallback(media(true))), true);
		assert.strictEqual(isDark(schemeFallback(media(false))), false);
		assert.strictEqual(isDark(schemeFallback(() => { throw new Error('no media'); })), false);
	});

	it('lets the Teams top bar shrink so its buttons stay clear of the window controls', () => {
		const { STYLE } = renderer._internals;
		// Side areas shrink to their content instead of Teams' fixed equal width.
		assert.match(STYLE, /titlebar-start-slot[\s\S]*titlebar-end-slot[\s\S]*min-width: min-content !important/);
		// The search box keeps 480px when there is room and may shrink below its 468px minimum.
		assert.match(STYLE, /search-f6-navigation-region"\] \{\s*flex: 0 1 480px !important;\s*min-width: 0 !important;/);
	});

	it('does not take its own fallback padding for Teams reserving the controls', () => {
		const { teamsReservesControls } = renderer._internals;
		const saved = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
		let ours = false;
		const bar = { classList: { contains: (name) => ours && name === 'tfl-wco-reserve' } };
		globalThis.document = { querySelector: () => bar };
		globalThis.window = { innerWidth: 800 };
		globalThis.getComputedStyle = () => ({ paddingRight: '72px' });
		try {
			const area = { x: 0, width: 728 };
			assert.strictEqual(teamsReservesControls(area), true, 'Teams padding counts');
			ours = true;
			assert.strictEqual(teamsReservesControls(area), false, 'our own padding does not');
		} finally {
			Object.assign(globalThis, saved);
		}
	});

	it('does nothing when disabled', () => {
		assert.doesNotThrow(() => renderer.init({ window: { titleBar: 'system' } }, {}));
	});
});

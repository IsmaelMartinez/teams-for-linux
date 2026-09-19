'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const { installIpcSecurity } = require('../../app/security/ipcSecurity');

const electronPath = require.resolve('electron');
const promptPath = require.resolve('../../app/webauthn/touchPrompt');

const CANCEL_CHANNEL = 'webauthn:touch-cancel';

/** Stand-in for a BrowserWindow: only what touchPrompt.js actually touches. */
class MockBrowserWindow extends EventEmitter {
	constructor(options) {
		super();
		this.options = options;
		this.webContents = { id: MockBrowserWindow.nextId++ };
		this.loadedFile = null;
		this.shown = false;
		this.destroyed = false;
	}

	loadFile(file) {
		this.loadedFile = file;
		// Electron emits this once the page is ready; the prompt shows itself here.
		this.emit('ready-to-show');
	}

	show() { this.shown = true; }
	focus() {}
	isDestroyed() { return this.destroyed; }

	close() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.emit('closed');
	}
}
MockBrowserWindow.nextId = 1;

let ipcMain;
let windows;
let originalInfo;
let originalDebug;

beforeEach(() => {
	windows = [];
	ipcMain = new EventEmitter();
	ipcMain.handle = () => {};
	// The real app wraps ipcMain before any module registers on it, and that
	// wrapping is what makes removal work at all. Test through it, not past it.
	installIpcSecurity(ipcMain, { error() {} });

	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			ipcMain,
			BrowserWindow: class extends MockBrowserWindow {
				constructor(options) {
					super(options);
					windows.push(this);
				}
			},
		},
	};
	delete require.cache[promptPath];

	originalInfo = console.info;
	originalDebug = console.debug;
	console.info = () => {};
	console.debug = () => {};
});

afterEach(() => {
	delete require.cache[electronPath];
	delete require.cache[promptPath];
	console.info = originalInfo;
	console.debug = originalDebug;
});

const loadPrompt = () => require('../../app/webauthn/touchPrompt').showTouchPrompt;

/** Fire a cancel the way the prompt's renderer does, from a given window. */
const sendCancel = (win) => ipcMain.emit(CANCEL_CHANNEL, { sender: win.webContents });

describe('WebAuthn touch prompt - window', () => {
	it('titles the window for the wait, not for the touch instant', () => {
		loadPrompt()(() => {});

		assert.strictEqual(windows[0].options.title, 'Waiting for your security key');
	});

	it('loads its own page with an isolated, sandboxed preload', () => {
		loadPrompt()(() => {});
		const { options, loadedFile } = windows[0];

		assert.strictEqual(path.basename(loadedFile), 'touchPrompt.html');
		assert.strictEqual(path.basename(options.webPreferences.preload), 'touchPromptPreload.js');
		assert.strictEqual(options.webPreferences.contextIsolation, true);
		assert.strictEqual(options.webPreferences.sandbox, true);
		assert.strictEqual(options.webPreferences.nodeIntegration, false);
		assert.strictEqual(options.alwaysOnTop, true);
		// Parented windows get torn down by the login page's own navigation.
		assert.strictEqual(options.parent, null);
	});

	it('shows itself once the page is ready', () => {
		loadPrompt()(() => {});

		assert.strictEqual(windows[0].shown, true);
	});
});

describe('WebAuthn touch prompt - cancelling', () => {
	it('calls back and closes the window when the user cancels', () => {
		let cancels = 0;
		loadPrompt()(() => { cancels++; });

		sendCancel(windows[0]);

		assert.strictEqual(cancels, 1);
		assert.strictEqual(windows[0].isDestroyed(), true);
	});

	it('treats closing the window from its titlebar as a cancel', () => {
		let cancels = 0;
		loadPrompt()(() => { cancels++; });

		windows[0].close();

		assert.strictEqual(cancels, 1);
	});

	// ipcMain listeners are global, so without a sender check a Cancel on one
	// prompt would abort every security-key call in flight.
	it('ignores a cancel that came from a different window', () => {
		const showTouchPrompt = loadPrompt();
		let firstCancels = 0;
		let secondCancels = 0;
		showTouchPrompt(() => { firstCancels++; });
		showTouchPrompt(() => { secondCancels++; });

		sendCancel(windows[1]);

		assert.strictEqual(firstCancels, 0);
		assert.strictEqual(secondCancels, 1);
	});

	it('does not call back twice when a cancel is followed by a dismiss', () => {
		let cancels = 0;
		const prompt = loadPrompt()(() => { cancels++; });

		sendCancel(windows[0]);
		prompt.dismiss();

		assert.strictEqual(cancels, 1);
	});

	it('does not call back when the call settles before the user cancels', () => {
		let cancels = 0;
		const prompt = loadPrompt()(() => { cancels++; });

		prompt.dismiss();
		sendCancel(windows[0]);

		assert.strictEqual(cancels, 0);
		assert.strictEqual(windows[0].isDestroyed(), true);
	});
});

describe('WebAuthn touch prompt - listener lifetime', () => {
	it('takes its cancel listener off again when dismissed', () => {
		const prompt = loadPrompt()(() => {});
		assert.strictEqual(ipcMain.listenerCount(CANCEL_CHANNEL), 1);

		prompt.dismiss();

		assert.strictEqual(ipcMain.listenerCount(CANCEL_CHANNEL), 0);
	});

	it('takes its cancel listener off again when cancelled', () => {
		loadPrompt()(() => {});

		sendCancel(windows[0]);

		assert.strictEqual(ipcMain.listenerCount(CANCEL_CHANNEL), 0);
	});

	// One listener per ceremony used to survive its window; the eleventh made
	// Node print MaxListenersExceededWarning, each one retaining a dead window.
	it('leaves nothing behind after a dozen ceremonies', () => {
		const showTouchPrompt = loadPrompt();

		for (let i = 0; i < 12; i++) {
			showTouchPrompt(() => {}).dismiss();
		}

		assert.strictEqual(ipcMain.listenerCount(CANCEL_CHANNEL), 0);
	});
});

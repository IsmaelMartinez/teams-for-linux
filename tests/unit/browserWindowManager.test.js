'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const managerPath = require.resolve('../../app/mainAppWindow/browserWindowManager');
const toastPath = require.resolve('../../app/incomingCallToast');

let createdOptions;
let BrowserWindowManager;
let appEvents;

before(() => {
	appEvents = [];
	require.cache[toastPath] = { id: toastPath, filename: toastPath, loaded: true, exports: class {
		show() {}
		hide() {}
	} };
	class MockBrowserWindow {
		constructor(options) {
			createdOptions = options;
		}
	}
	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			app: { emit: (...args) => appEvents.push(args) },
			BrowserWindow: MockBrowserWindow,
			ipcMain: {},
			nativeImage: {},
			nativeTheme: { shouldUseDarkColors: false },
			powerSaveBlocker: {},
			session: {},
			WebContentsView: class {},
		},
	};
	delete require.cache[managerPath];
	BrowserWindowManager = require(managerPath);
});

after(() => {
	delete require.cache[electronPath];
	delete require.cache[toastPath];
	delete require.cache[managerPath];
});

describe('BrowserWindowManager.createNewBrowserWindow', () => {
	it('sets a minimum size so a tiny restored size cannot stick (#2996)', () => {
		const manager = new BrowserWindowManager({ config: { menubar: 'auto', partition: 'persist:teams-4-linux' } });
		manager.createNewBrowserWindow({ x: 0, y: 0, width: 1, height: 1 });

		assert.strictEqual(createdOptions.width, 1);
		assert.strictEqual(createdOptions.height, 1);
		assert.ok(createdOptions.minWidth >= 400, `minWidth was ${createdOptions.minWidth}`);
		assert.ok(createdOptions.minHeight >= 300, `minHeight was ${createdOptions.minHeight}`);
	});
});

describe('BrowserWindowManager window.hideTitleBar', () => {
	const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
	const setPlatform = (value) => Object.defineProperty(process, 'platform', { value });
	const build = (config) => {
		new BrowserWindowManager({ config }).createNewBrowserWindow({ x: 0, y: 0, width: 800, height: 600 });
		return createdOptions;
	};

	after(() => Object.defineProperty(process, 'platform', originalPlatform));

	it('keeps the native frame and overlays the window buttons on Linux', () => {
		setPlatform('linux');
		const options = build({ frame: true, window: { hideTitleBar: true } });

		assert.strictEqual(options.frame, true);
		assert.strictEqual(options.titleBarStyle, 'hidden');
		assert.ok(options.titleBarOverlay.height > 0);
	});

	it('leaves the window alone when the option is off or unset', () => {
		setPlatform('linux');
		for (const config of [{ frame: true }, { frame: true, window: { hideTitleBar: false } }]) {
			const options = build(config);
			assert.strictEqual(options.titleBarStyle, undefined);
			assert.strictEqual(options.titleBarOverlay, undefined);
		}
	});

	it('does nothing on other platforms', () => {
		setPlatform('darwin');
		assert.strictEqual(build({ frame: true, window: { hideTitleBar: true } }).titleBarStyle, undefined);
	});

	it('reports whether the title bar is hidden, for the deferred first show', () => {
		const hidden = (config) => new BrowserWindowManager({ config }).isTitleBarHidden();

		setPlatform('linux');
		assert.strictEqual(hidden({ frame: true, window: { hideTitleBar: true } }), true);
		assert.strictEqual(hidden({ frame: true, window: { hideTitleBar: false } }), false);
		assert.strictEqual(hidden({ frame: true }), false);
		assert.strictEqual(hidden({ frame: false, window: { hideTitleBar: true } }), false);
		setPlatform('darwin');
		assert.strictEqual(hidden({ frame: true, window: { hideTitleBar: true } }), false);
	});

	it('yields to window.frame: false', () => {
		setPlatform('linux');
		const options = build({ frame: false, window: { hideTitleBar: true } });

		assert.strictEqual(options.frame, false);
		assert.strictEqual(options.titleBarStyle, undefined);
	});
});

describe('BrowserWindowManager incoming call routing', () => {
	it('preserves the reporting renderer on call connected/disconnected events', async () => {
		const manager = new BrowserWindowManager({ config: {} });
		const sender = {};
		manager.disableScreenLockElectron = () => true;
		manager.disableScreenLockWakeLockSentinel = () => true;
		manager.enableScreenLockElectron = () => true;
		manager.enableScreenLockWakeLockSentinel = () => true;
		await manager.assignOnCallConnectedHandler()({ sender });
		assert.deepEqual(appEvents.at(-1), ['teams-call-connected', sender]);
		await manager.assignOnCallDisconnectedHandler()({ sender });
		assert.deepEqual(appEvents.at(-1), ['teams-call-disconnected', sender]);
	});

	it('routes allowed actions to the renderer that reported the ring', async () => {
		const manager = new BrowserWindowManager({ config: {} });
		const senderSent = [];
		const rootSent = [];
		const sender = { isDestroyed: () => false, send: (...args) => senderSent.push(args) };
		manager.window = { webContents: { isDestroyed: () => false, send: (...args) => rootSent.push(args) } };
		await manager.assignOnIncomingCallCreatedHandler()({ sender }, {});
		assert.equal(manager.performIncomingCallAction('ACCEPT_AUDIO'), true);
		assert.deepEqual(senderSent, [['incoming-call-action', 'ACCEPT_AUDIO']]);
		assert.deepEqual(rootSent, []);
		assert.equal(manager.performIncomingCallAction('FOO'), false);
		assert.deepEqual(senderSent, [['incoming-call-action', 'ACCEPT_AUDIO']]);
		assert.deepEqual(rootSent, []);
	});

	it('routes actions to the most recently ringing renderer only', async () => {
		const manager = new BrowserWindowManager({ config: {} });
		const sentA = [];
		const sentB = [];
		const senderA = { isDestroyed: () => false, send: (...args) => sentA.push(args) };
		const senderB = { isDestroyed: () => false, send: (...args) => sentB.push(args) };
		await manager.assignOnIncomingCallCreatedHandler()({ sender: senderA }, {});
		await manager.assignOnIncomingCallCreatedHandler()({ sender: senderB }, {});
		assert.equal(manager.performIncomingCallAction('DECLINE'), true);
		assert.deepEqual(sentA, []);
		assert.deepEqual(sentB, [['incoming-call-action', 'DECLINE']]);
	});

	it('returns false without an incoming call even when the root renderer is live', () => {
		const manager = new BrowserWindowManager({ config: {} });
		const rootSent = [];
		manager.window = { webContents: { isDestroyed: () => false, send: (...args) => rootSent.push(args) } };
		assert.equal(manager.performIncomingCallAction('ACCEPT_AUDIO'), false);
		assert.deepEqual(rootSent, []);
	});

	it('returns false without sending when both ringing sender and root renderer are missing or destroyed', async () => {
		const manager = new BrowserWindowManager({ config: {} });
		manager.window = null;
		await manager.assignOnIncomingCallCreatedHandler()({}, {});
		assert.equal(manager.performIncomingCallAction('DECLINE'), false);

		const deadSenderSent = [];
		const deadSender = { isDestroyed: () => true, send: (...args) => deadSenderSent.push(args) };
		await manager.assignOnIncomingCallCreatedHandler()({ sender: deadSender }, {});
		assert.equal(manager.performIncomingCallAction('DECLINE'), false);
		assert.deepEqual(deadSenderSent, []);

		const rootSent = [];
		manager.window = { webContents: { isDestroyed: () => true, send: (...args) => rootSent.push(args) } };
		assert.equal(manager.performIncomingCallAction('DECLINE'), false);
		assert.deepEqual(rootSent, []);
	});

	it('does not let a different renderer end the latest ring; matching end clears it', async () => {
		const manager = new BrowserWindowManager({ config: {} });
		const sent = [];
		const sender = { isDestroyed: () => false, send: (...args) => sent.push(args) };
		const other = { isDestroyed: () => false };
		await manager.assignOnIncomingCallCreatedHandler()({ sender }, {});
		const eventsBeforeUnrelatedEnd = appEvents.length;
		let cleanups = 0;
		manager.handleOnIncomingCallEnded = () => { cleanups += 1; };
		await manager.assignOnIncomingCallEndedHandler()({ sender: other });
		assert.equal(appEvents.length, eventsBeforeUnrelatedEnd, 'an unrelated end must not announce the current ring ended');
		assert.equal(cleanups, 0, 'an unrelated end must not hide the current toast');
		assert.equal(manager.performIncomingCallAction('DECLINE'), true);
		await manager.assignOnIncomingCallEndedHandler()({ sender });
		assert.equal(cleanups, 1);
		assert.equal(manager.performIncomingCallAction('DECLINE'), false);
		assert.deepEqual(appEvents.at(-1), ['teams-incoming-call-ended']);
	});

	it('never redirects a destroyed ringing renderer to another account and catches dispatch errors', async () => {
		const manager = new BrowserWindowManager({ config: {} });
		const sent = [];
		const dead = { isDestroyed: () => true };
		const root = { isDestroyed: () => false, send: (...args) => sent.push(args) };
		manager.window = { webContents: root };
		await manager.assignOnIncomingCallCreatedHandler()({ sender: dead }, {});
		assert.equal(manager.performIncomingCallAction('ACCEPT_VIDEO'), false);
		assert.deepEqual(sent, []);
		manager.window = { webContents: { isDestroyed: () => false, send() { throw Error('gone'); } } };
		manager.incomingCallWebContents = null;
		assert.equal(manager.performIncomingCallAction('DECLINE'), false);
	});

});

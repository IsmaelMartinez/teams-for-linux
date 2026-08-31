'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const electronPath = require.resolve('electron');
const servicePath = require.resolve('../../app/notifications/service');

let handlers;
let notifications;
let dataUrls;
let imageBuffers;
let bufferImageEmpty;
let sends;
let windowActions;

function installElectronMock() {
	handlers = new Map();
	notifications = [];
	dataUrls = [];
	imageBuffers = [];
	bufferImageEmpty = false;
	sends = [];
	windowActions = [];

	class MockNotification extends EventEmitter {
		constructor(options) {
			super();
			this.options = options;
			this.shown = false;
			notifications.push(this);
		}

		show() {
			this.shown = true;
		}
	}

	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			Notification: MockNotification,
			ipcMain: {
				handle: (channel, handler) => handlers.set(channel, handler),
			},
			nativeImage: {
				createFromDataURL: (url) => {
					dataUrls.push(url);
					return { source: 'data-url', isEmpty: () => false };
				},
				createFromBuffer: (buffer) => {
					imageBuffers.push(buffer);
					return { source: 'buffer', isEmpty: () => bufferImageEmpty };
				},
			},
		},
	};

	delete require.cache[servicePath];
}

function cleanupElectronMock() {
	delete require.cache[electronPath];
	delete require.cache[servicePath];
}

function responseWith(bytes, options = {}) {
	const {
		url = 'https://teams.microsoft.com/avatar.png',
		contentLength = bytes.length,
	} = options;
	let sent = false;
	return {
		ok: true,
		url,
		headers: { get: () => String(contentLength) },
		body: {
			getReader: () => ({
				read: async () => {
					if (sent) return { done: true };
					sent = true;
					return { done: false, value: bytes };
				},
				cancel: async () => {},
			}),
		},
	};
}

function makeService(fetch, options = {}) {
	const { config = {}, windowMissing = false, windowDestroyed = false } = options;
	const window = {
		webContents: {
			getURL: () => 'https://teams.microsoft.com/',
			session: { fetch },
			isDestroyed: () => false,
			send: () => {},
		},
		isDestroyed: () => windowDestroyed,
	};
	const mainWindow = {
		getWindow: () => (windowMissing ? null : window),
		show: () => windowActions.push('show'),
		restoreWindow: () => windowActions.push('restore'),
	};
	const NotificationService = require(servicePath);
	const service = new NotificationService(
		null,
		{ appPath: '/app', defaultNotificationUrgency: 'normal', ...config },
		mainWindow,
		() => 1,
	);
	service.initialize();
	return service;
}

function makeSender(destroyed = false) {
	return {
		isDestroyed: () => destroyed,
		send: (channel, id) => sends.push([channel, id]),
	};
}

async function show(options, sender) {
	await handlers.get('show-notification')({ sender }, {
		title: 'Title',
		body: 'Body',
		timeoutType: 'default',
		...options,
	});
}

describe('NotificationService icons', () => {
	let originalConsoleDebug;
	let originalConsoleWarn;

	beforeEach(() => {
		installElectronMock();
		originalConsoleDebug = console.debug;
		originalConsoleWarn = console.warn;
		console.debug = () => {};
		console.warn = () => {};
	});

	afterEach(() => {
		console.debug = originalConsoleDebug;
		console.warn = originalConsoleWarn;
		cleanupElectronMock();
	});

	it('keeps data URL icons on the existing path', async () => {
		let fetchCalls = 0;
		makeService(async () => { fetchCalls += 1; });

		await show({ icon: 'data:image/png;base64,aWNvbg==' });

		assert.deepStrictEqual(dataUrls, ['data:image/png;base64,aWNvbg==']);
		assert.strictEqual(fetchCalls, 0);
		assert.strictEqual(notifications[0].options.icon.source, 'data-url');
		assert.strictEqual(notifications[0].shown, true);
	});

	it('fetches remote icons through the authenticated window session', async () => {
		const bytes = Uint8Array.from([1, 2, 3, 4]);
		const calls = [];
		makeService(async (...args) => {
			calls.push(args);
			return responseWith(bytes);
		});

		await show({ icon: 'https://teams.microsoft.com/avatar.png' });

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0][0], 'https://teams.microsoft.com/avatar.png');
		assert.strictEqual(calls[0][1].credentials, 'include');
		assert.strictEqual(calls[0][1].redirect, 'error');
		assert.deepStrictEqual([...imageBuffers[0]], [...bytes]);
		assert.strictEqual(notifications[0].options.icon.source, 'buffer');
		assert.strictEqual(notifications[0].shown, true);
	});

	it('accepts direct responses without a response URL', async () => {
		const bytes = Uint8Array.from([1, 2, 3, 4]);
		makeService(async () => responseWith(bytes, { url: '' }));

		await show({ icon: 'https://teams.microsoft.com/avatar.png' });

		assert.deepStrictEqual([...imageBuffers[0]], [...bytes]);
		assert.strictEqual(notifications[0].options.icon.source, 'buffer');
		assert.strictEqual(notifications[0].shown, true);
	});

	it('still shows the notification when a remote icon cannot be loaded', async () => {
		makeService(async () => { throw new Error('network failure'); });

		await show({ icon: 'https://teams.microsoft.com/avatar.png' });

		assert.strictEqual('icon' in notifications[0].options, false);
		assert.strictEqual(notifications[0].shown, true);
	});

	for (const [label, icon] of [
		['non-HTTPS icon URLs', 'http://localhost/avatar.png'],
		['icons from a different HTTPS origin', 'https://example.com/avatar.png'],
	]) {
		it(`does not fetch ${label}`, async () => {
			let fetchCalls = 0;
			makeService(async () => { fetchCalls += 1; });

			await show({ icon });

			assert.strictEqual(fetchCalls, 0);
			assert.strictEqual('icon' in notifications[0].options, false);
			assert.strictEqual(notifications[0].shown, true);
		});
	}

	it('still shows the notification when fetch rejects a redirect', async () => {
		makeService(async (_url, options) => {
			assert.strictEqual(options.redirect, 'error');
			throw new TypeError('redirect rejected');
		});

		await show({ icon: 'https://teams.microsoft.com/avatar.png' });

		assert.strictEqual(imageBuffers.length, 0);
		assert.strictEqual('icon' in notifications[0].options, false);
		assert.strictEqual(notifications[0].shown, true);
	});

	it('omits remote icons larger than the size limit', async () => {
		const bytes = Uint8Array.from([1, 2, 3, 4]);
		makeService(async () => responseWith(bytes, {
			contentLength: 5 * 1024 * 1024 + 1,
		}));

		await show({ icon: 'https://teams.microsoft.com/avatar.png' });

		assert.strictEqual(imageBuffers.length, 0);
		assert.strictEqual('icon' in notifications[0].options, false);
		assert.strictEqual(notifications[0].shown, true);
	});

	it('omits remote icons that Electron cannot decode', async () => {
		bufferImageEmpty = true;
		makeService(async () => responseWith(Uint8Array.from([1, 2, 3, 4])));

		await show({ icon: 'https://teams.microsoft.com/avatar.png' });

		assert.strictEqual(imageBuffers.length, 1);
		assert.strictEqual('icon' in notifications[0].options, false);
		assert.strictEqual(notifications[0].shown, true);
	});
});

// Teams attaches its own click handler to the stub preload's
// createElectronNotification returns, and that handler is what opens the sending
// conversation. Showing the window is not enough: without relaying the click back
// to the renderer the user lands on whatever chat was already open (#2768
// follow-up). The relay targets event.sender, not the root window, because under
// multiAccount each profile is its own WebContentsView on its own partition.
describe('NotificationService click and close relay', () => {
	let originalConsoleDebug;
	let originalConsoleWarn;

	beforeEach(() => {
		installElectronMock();
		originalConsoleDebug = console.debug;
		originalConsoleWarn = console.warn;
		console.debug = () => {};
		console.warn = () => {};
	});

	afterEach(() => {
		console.debug = originalConsoleDebug;
		console.warn = originalConsoleWarn;
		cleanupElectronMock();
	});

	for (const [label, clickAction, notificationId, expectedWindow, expectedSends] of [
		['relays the click to the creating renderer with the notification id', undefined, 'notif-1', ['show'], [['notification-clicked', 'notif-1']]],
		['relays the click when clickAction is "restore"', 'restore', 'notif-2', ['restore'], [['notification-clicked', 'notif-2']]],
		['does not touch the window or relay when clickAction is "none"', 'none', 'notif-3', [], []],
	]) {
		it(label, async () => {
			makeService(async () => {}, {
				config: clickAction ? { notifications: { electron: { clickAction } } } : {},
			});

			await show({ notificationId }, makeSender());
			notifications[0].emit('click');

			assert.deepStrictEqual(windowActions, expectedWindow);
			assert.deepStrictEqual(sends, expectedSends);
		});
	}

	it('does not throw or relay when the window is gone', async () => {
		makeService(async () => {}, { windowMissing: true });

		await show({ notificationId: 'notif-4' }, makeSender());
		notifications[0].emit('click');

		assert.deepStrictEqual(windowActions, []);
		assert.deepStrictEqual(sends, []);
	});

	it('does not relay when the window is destroyed', async () => {
		makeService(async () => {}, { windowDestroyed: true });

		await show({ notificationId: 'notif-5' }, makeSender());
		notifications[0].emit('click');

		assert.deepStrictEqual(windowActions, []);
		assert.deepStrictEqual(sends, []);
	});

	it('still shows the window when the sender is destroyed, but sends nothing', async () => {
		makeService(async () => {});

		await show({ notificationId: 'notif-6' }, makeSender(true));
		notifications[0].emit('click');

		assert.deepStrictEqual(windowActions, ['show']);
		assert.deepStrictEqual(sends, []);
	});

	it('relays close to the creating renderer', async () => {
		makeService(async () => {});

		await show({ notificationId: 'notif-7' }, makeSender());
		notifications[0].emit('close');

		assert.deepStrictEqual(sends, [['notification-closed', 'notif-7']]);
	});
});

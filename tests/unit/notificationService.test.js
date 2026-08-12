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

function installElectronMock() {
	handlers = new Map();
	notifications = [];
	dataUrls = [];
	imageBuffers = [];
	bufferImageEmpty = false;

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

function makeService(fetch) {
	const window = {
		webContents: {
			getURL: () => 'https://teams.microsoft.com/',
			session: { fetch },
			isDestroyed: () => false,
			send: () => {},
		},
		isDestroyed: () => false,
	};
	const mainWindow = {
		getWindow: () => window,
		show: () => {},
		restoreWindow: () => {},
	};
	const NotificationService = require(servicePath);
	const service = new NotificationService(
		null,
		{ appPath: '/app', defaultNotificationUrgency: 'normal' },
		mainWindow,
		() => 1,
	);
	service.initialize();
	return service;
}

async function show(options) {
	await handlers.get('show-notification')({}, {
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

	it('does not fetch non-HTTPS icon URLs', async () => {
		let fetchCalls = 0;
		makeService(async () => { fetchCalls += 1; });

		await show({ icon: 'http://localhost/avatar.png' });

		assert.strictEqual(fetchCalls, 0);
		assert.strictEqual('icon' in notifications[0].options, false);
		assert.strictEqual(notifications[0].shown, true);
	});

	it('does not fetch icons from a different HTTPS origin', async () => {
		let fetchCalls = 0;
		makeService(async () => { fetchCalls += 1; });

		await show({ icon: 'https://example.com/avatar.png' });

		assert.strictEqual(fetchCalls, 0);
		assert.strictEqual('icon' in notifications[0].options, false);
		assert.strictEqual(notifications[0].shown, true);
	});

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

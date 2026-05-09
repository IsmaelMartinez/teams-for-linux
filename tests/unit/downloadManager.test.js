'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const electronPath = require.resolve('electron');
const downloadManagerPath = require.resolve('../../app/downloadManager');

let notificationInstances;
let showItemInFolderCalls;
let MockNotification;

function installElectronMock() {
	notificationInstances = [];
	showItemInFolderCalls = [];

	MockNotification = class MockNotification extends EventEmitter {
		constructor(options) {
			super();
			this.options = options;
			this.shown = false;
			notificationInstances.push(this);
		}
		show() {
			this.shown = true;
		}
	};

	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			Notification: MockNotification,
			shell: {
				showItemInFolder: (...args) => showItemInFolderCalls.push(args),
			},
		},
	};

	delete require.cache[downloadManagerPath];
}

function cleanupElectronMock() {
	delete require.cache[electronPath];
	delete require.cache[downloadManagerPath];
	notificationInstances = undefined;
	showItemInFolderCalls = undefined;
	MockNotification = undefined;
}

function makeFakeSession() {
	const emitter = new EventEmitter();
	emitter.on = emitter.on.bind(emitter);
	return emitter;
}

function makeFakeDownloadItem(filename, savePath, sizes = {}) {
	const emitter = new EventEmitter();
	emitter.getFilename = () => filename;
	emitter.getSavePath = () => savePath;
	emitter.getTotalBytes = () => sizes.totalBytes ?? 0;
	emitter.getReceivedBytes = () => sizes.receivedBytes ?? 0;
	emitter.setSizes = (next) => Object.assign(sizes, next);
	return emitter;
}

// `download.enabled` defaults to false (opt-in master switch). Most tests want
// the feature on; this helper layers `enabled: true` over any extra download
// sub-config the test provides, while preserving top-level fields like
// `disableNotifications`.
function enabledConfig(extra = {}) {
	const { download = {}, ...rest } = extra;
	return {
		...rest,
		download: { enabled: true, ...download },
	};
}

function makeFakeMainAppWindow(initialTitle = 'Microsoft Teams') {
	const calls = [];
	let destroyed = false;
	let title = initialTitle;
	const window = {
		isDestroyed: () => destroyed,
		setProgressBar: (...args) => calls.push(args),
		getTitle: () => title,
		setTitle: (next) => { title = next; },
		_destroy: () => { destroyed = true; },
	};
	return {
		getWindow: () => window,
		_calls: calls,
		_window: window,
		get _title() { return title; },
		set _title(v) { title = v; },
	};
}

describe('DownloadManager', () => {
	let originalConsoleDebug;
	let originalConsoleWarn;
	let originalConsoleError;

	beforeEach(() => {
		installElectronMock();
		originalConsoleDebug = console.debug;
		originalConsoleWarn = console.warn;
		originalConsoleError = console.error;
		console.debug = () => {};
		console.warn = () => {};
		console.error = () => {};
	});

	afterEach(() => {
		console.debug = originalConsoleDebug;
		console.warn = originalConsoleWarn;
		console.error = originalConsoleError;
		cleanupElectronMock();
	});

	it('shows a completion notification on completed downloads', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('report.pdf', '/home/user/Downloads/report.pdf');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		assert.strictEqual(notificationInstances.length, 1);
		const notification = notificationInstances[0];
		assert.strictEqual(notification.shown, true);
		assert.strictEqual(notification.options.title, 'Download complete');
		assert.match(notification.options.body, /report\.pdf/);
	});

	it('opens the containing folder when the completion notification is clicked', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const savePath = '/home/user/Downloads/report.pdf';
		const item = makeFakeDownloadItem('report.pdf', savePath);
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		notificationInstances[0].emit('click');

		assert.deepStrictEqual(showItemInFolderCalls, [[savePath]]);
	});

	it('shows a failure notification when a download is interrupted', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('huge.iso', '/home/user/Downloads/huge.iso');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'interrupted');

		assert.strictEqual(notificationInstances.length, 1);
		assert.strictEqual(notificationInstances[0].options.title, 'Download did not finish');
		assert.match(notificationInstances[0].options.body, /interrupted/i);
	});

	it('shows a failure notification when a download is cancelled', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('huge.iso', '/home/user/Downloads/huge.iso');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'cancelled');

		assert.strictEqual(notificationInstances.length, 1);
		assert.match(notificationInstances[0].options.body, /cancelled/i);
	});

	it('does not notify when notifyOnDownloadComplete is false', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(
			enabledConfig({ download: { notifyOnDownloadComplete: false } }),
		);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('report.pdf', '/home/user/Downloads/report.pdf');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		assert.strictEqual(notificationInstances.length, 0);
	});

	it('does not notify when disableNotifications is true (global kill-switch)', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig({ disableNotifications: true }));
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('report.pdf', '/home/user/Downloads/report.pdf');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		assert.strictEqual(notificationInstances.length, 0);
	});

	it('uses the final filename from the DownloadItem at done-time, not at start', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('report.pdf', '/home/user/Downloads/report-final.pdf');
		fakeSession.emit('will-download', {}, item);

		// Simulate the renderer/host renaming the file before completion.
		item.getFilename = () => 'report-final.pdf';

		item.emit('done', {}, 'completed');

		assert.match(notificationInstances[0].options.body, /report-final\.pdf/);
	});

	it('keeps a strong reference to live notifications so click listeners survive GC', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('report.pdf', '/home/user/Downloads/report.pdf');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		const notification = notificationInstances[0];
		// The manager must currently be retaining the notification — listenerCount
		// is the cheapest observable proxy: it tracks `close`/`click` listeners
		// the manager attached for tracking.
		assert.ok(notification.listenerCount('close') >= 1);
		assert.ok(notification.listenerCount('click') >= 1);

		notification.emit('click');
		// After click, the manager should release its strong reference. We can't
		// directly inspect a private Set, but the tracking listener removes
		// itself with `once`, so the close listener count should drop.
		assert.strictEqual(notification.listenerCount('close'), 0);
	});

	it('is idempotent across repeated initialize calls on the same session', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('report.pdf', '/home/user/Downloads/report.pdf');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		assert.strictEqual(notificationInstances.length, 1);
	});

	it('handles missing session gracefully', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager(enabledConfig());
		assert.doesNotThrow(() => manager.initialize(null));
	});

	it('drives the taskbar progress bar from receivedBytes / totalBytes', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow();
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem(
			'big.zip',
			'/home/user/Downloads/big.zip',
			{ totalBytes: 100, receivedBytes: 0 },
		);
		fakeSession.emit('will-download', {}, item);

		item.setSizes({ receivedBytes: 25 });
		item.emit('updated');
		item.setSizes({ receivedBytes: 50 });
		item.emit('updated');

		// Initial call on will-download is 0/100, then 0.25, then 0.50.
		const fractions = mainAppWindow._calls.map(c => c[0]);
		assert.deepStrictEqual(fractions, [0, 0.25, 0.5]);
	});

	it('uses indeterminate mode when total size is unknown', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow();
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem(
			'unknown.bin',
			'/home/user/Downloads/unknown.bin',
			{ totalBytes: 0, receivedBytes: 0 },
		);
		fakeSession.emit('will-download', {}, item);

		const [first, options] = mainAppWindow._calls.at(-1);
		assert.strictEqual(first, 2);
		assert.deepStrictEqual(options, { mode: 'indeterminate' });
	});

	it('aggregates progress across concurrent downloads', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow();
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const a = makeFakeDownloadItem('a', '/p/a', { totalBytes: 100, receivedBytes: 0 });
		const b = makeFakeDownloadItem('b', '/p/b', { totalBytes: 300, receivedBytes: 0 });
		fakeSession.emit('will-download', {}, a);
		fakeSession.emit('will-download', {}, b);

		// 50/100 + 150/300 = 200/400 = 0.5 (byte-weighted).
		a.setSizes({ receivedBytes: 50 });
		b.setSizes({ receivedBytes: 150 });
		a.emit('updated');

		const lastFraction = mainAppWindow._calls.at(-1)[0];
		assert.strictEqual(lastFraction, 0.5);
	});

	it('clears the progress bar when all downloads finish', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow();
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem(
			'big.zip',
			'/home/user/Downloads/big.zip',
			{ totalBytes: 100, receivedBytes: 100 },
		);
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		assert.strictEqual(mainAppWindow._calls.at(-1)[0], -1);
	});

	it('does not drive progress when showProgressBar is false', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow();
		const manager = new DownloadManager(
			enabledConfig({ download: { showProgressBar: false } }),
			mainAppWindow,
		);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem(
			'big.zip',
			'/home/user/Downloads/big.zip',
			{ totalBytes: 100, receivedBytes: 0 },
		);
		fakeSession.emit('will-download', {}, item);
		item.setSizes({ receivedBytes: 50 });
		item.emit('updated');

		assert.strictEqual(mainAppWindow._calls.length, 0);
	});

	it("removes the 'updated' listener from the item once the download finishes", () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow();
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem(
			'big.zip',
			'/home/user/Downloads/big.zip',
			{ totalBytes: 100, receivedBytes: 0 },
		);
		fakeSession.emit('will-download', {}, item);

		assert.strictEqual(item.listenerCount('updated'), 1);
		item.emit('done', {}, 'completed');
		assert.strictEqual(item.listenerCount('updated'), 0);
	});

	it('prefixes the window title with progress while a download is in flight', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow('Chats - Microsoft Teams');
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem(
			'big.zip',
			'/p/big.zip',
			{ totalBytes: 1000, receivedBytes: 0 },
		);
		fakeSession.emit('will-download', {}, item);
		item.setSizes({ receivedBytes: 340 });
		item.emit('updated');

		assert.strictEqual(mainAppWindow._title, '[34%] Chats - Microsoft Teams');
	});

	it('uses an indeterminate marker in the title when total size is unknown', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow('Microsoft Teams');
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('unknown.bin', '/p/unknown.bin', { totalBytes: 0 });
		fakeSession.emit('will-download', {}, item);

		assert.strictEqual(mainAppWindow._title, '[downloading] Microsoft Teams');
	});

	it('strips its own prefix when re-applying so title does not stack', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow('Microsoft Teams');
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('big.zip', '/p/big.zip', { totalBytes: 100, receivedBytes: 10 });
		fakeSession.emit('will-download', {}, item);
		item.setSizes({ receivedBytes: 50 });
		item.emit('updated');
		item.setSizes({ receivedBytes: 90 });
		item.emit('updated');

		assert.strictEqual(mainAppWindow._title, '[90%] Microsoft Teams');
	});

	it('preserves a Teams-set page title when re-applying the prefix', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow('Microsoft Teams');
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('big.zip', '/p/big.zip', { totalBytes: 100, receivedBytes: 10 });
		fakeSession.emit('will-download', {}, item);

		// Simulate Teams updating the page title mid-download (which would
		// normally fire `page-title-updated` and overwrite our prefix).
		mainAppWindow._title = 'New chat - Microsoft Teams';
		item.setSizes({ receivedBytes: 50 });
		item.emit('updated');

		assert.strictEqual(mainAppWindow._title, '[50%] New chat - Microsoft Teams');
	});

	it('clears the title prefix when all downloads finish', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow('Microsoft Teams');
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('big.zip', '/p/big.zip', { totalBytes: 100, receivedBytes: 0 });
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		assert.strictEqual(mainAppWindow._title, 'Microsoft Teams');
	});

	it('survives a destroyed main window during progress updates', () => {
		const DownloadManager = require(downloadManagerPath);
		const mainAppWindow = makeFakeMainAppWindow();
		const manager = new DownloadManager(enabledConfig(), mainAppWindow);
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem(
			'big.zip',
			'/home/user/Downloads/big.zip',
			{ totalBytes: 100, receivedBytes: 50 },
		);
		fakeSession.emit('will-download', {}, item);

		mainAppWindow._window._destroy();
		assert.doesNotThrow(() => item.emit('updated'));
	});

	it('does nothing when download.enabled is not set (opt-in default)', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager({});
		const fakeSession = makeFakeSession();
		const onSpy = (...args) => fakeSession._onCalls.push(args);
		fakeSession._onCalls = [];
		fakeSession.on = onSpy;

		manager.initialize(fakeSession);

		// No 'will-download' listener was attached, so a download event would
		// be ignored.
		assert.strictEqual(fakeSession._onCalls.length, 0);
	});

	it('does nothing when download.enabled is explicitly false', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager({ download: { enabled: false } });
		const fakeSession = makeFakeSession();
		fakeSession._onCalls = [];
		fakeSession.on = (...args) => fakeSession._onCalls.push(args);

		manager.initialize(fakeSession);

		assert.strictEqual(fakeSession._onCalls.length, 0);
	});
});

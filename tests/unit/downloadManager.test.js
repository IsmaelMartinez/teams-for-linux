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

function makeFakeDownloadItem(filename, savePath) {
	const emitter = new EventEmitter();
	emitter.getFilename = () => filename;
	emitter.getSavePath = () => savePath;
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

'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

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
		const manager = new DownloadManager({});
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
		const manager = new DownloadManager({});
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
		const manager = new DownloadManager({});
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
		const manager = new DownloadManager({});
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
		const manager = new DownloadManager({
			download: { notifyOnDownloadComplete: false },
		});
		const fakeSession = makeFakeSession();
		manager.initialize(fakeSession);

		const item = makeFakeDownloadItem('report.pdf', '/home/user/Downloads/report.pdf');
		fakeSession.emit('will-download', {}, item);
		item.emit('done', {}, 'completed');

		assert.strictEqual(notificationInstances.length, 0);
	});

	it('is idempotent across repeated initialize calls on the same session', () => {
		const DownloadManager = require(downloadManagerPath);
		const manager = new DownloadManager({});
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
		const manager = new DownloadManager({});
		assert.doesNotThrow(() => manager.initialize(null));
	});
});

void Module; // keep require.cache mutation linter-happy
void mock;

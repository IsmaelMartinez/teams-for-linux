'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const electronPath = require.resolve('electron');
const selectorPath = path.join(__dirname, '..', '..', 'app', 'screenSharing', 'index.js');
const STATE_EVENTS = ['maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'];
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 10));

let views;
let ipcOnce;

class FakeView {
	constructor() {
		this.webContents = { loadFile() {}, destroy() {} };
		views.push(this);
	}
	setBounds(bounds) {
		this.bounds = bounds;
	}
}

function fakeParent() {
	return {
		listeners: {},
		bounds: { width: 1000, height: 700 },
		contentView: { addChildView() {}, removeChildView() {} },
		on(event, cb) {
			(this.listeners[event] ||= []).push(cb);
		},
		removeListener(event, cb) {
			this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== cb);
		},
		emit(event) {
			for (const cb of this.listeners[event] || []) cb();
		},
		getBounds() {
			return this.bounds;
		},
	};
}

beforeEach(() => {
	views = [];
	ipcOnce = {};
	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			WebContentsView: FakeView,
			ipcMain: {
				once(channel, cb) {
					ipcOnce[channel] = cb;
				},
				removeListener() {},
			},
		},
	};
	delete require.cache[selectorPath];
});

afterEach(() => {
	delete require.cache[selectorPath];
	delete require.cache[electronPath];
});

describe('StreamSelector window-state bounds (#2947)', () => {
	for (const event of ['resize', ...STATE_EVENTS]) {
		it(`re-fits the picker to the parent on ${event}`, async () => {
			const { StreamSelector } = require(selectorPath);
			const parent = fakeParent();
			new StreamSelector(parent).show(() => {});
			await nextTick();
			assert.deepStrictEqual(views[0].bounds, { x: 0, y: 0, width: 1000, height: 700 });
			parent.bounds = { width: 1920, height: 1080 };
			parent.emit(event);
			await nextTick();
			assert.deepStrictEqual(views[0].bounds, { x: 0, y: 0, width: 1920, height: 1080 });
		});
	}

	it('removes every parent listener when the picker closes', () => {
		const { StreamSelector } = require(selectorPath);
		const parent = fakeParent();
		new StreamSelector(parent).show(() => {});
		ipcOnce['close-view']();
		for (const event of ['resize', ...STATE_EVENTS]) {
			assert.strictEqual((parent.listeners[event] || []).length, 0, event);
		}
	});
});

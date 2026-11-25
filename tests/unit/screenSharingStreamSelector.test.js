'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const electronPath = require.resolve('electron');
const selectorPath = path.join(__dirname, '..', '..', 'app', 'screenSharing', 'index.js');
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 10));

let views;
let ipcOnce;

class FakeView {
	constructor() {
		this.webContents = {
			destroyed: false,
			loadFile() {},
			isDestroyed() {
				return this.destroyed;
			},
			destroy() {
				this.destroyed = true;
			},
		};
		views.push(this);
	}
	setBounds(bounds) {
		this.bounds = bounds;
	}
}

function fakeEmitter() {
	return {
		listeners: {},
		on(event, cb) {
			(this.listeners[event] ||= []).push(cb);
		},
		once(event, cb) {
			this.on(event, cb);
		},
		removeListener(event, cb) {
			this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== cb);
		},
		emit(event) {
			for (const cb of [...(this.listeners[event] || [])]) cb();
		},
	};
}

function fakeParent() {
	const parent = fakeEmitter();
	parent.bounds = { width: 1000, height: 700 };
	parent.destroyed = false;
	parent.contentView = Object.assign(fakeEmitter(), {
		removed: [],
		addChildView() {},
		removeChildView(view) {
			this.removed.push(view);
		},
	});
	parent.isDestroyed = () => parent.destroyed;
	parent.getBounds = () => {
		if (parent.destroyed) throw new Error('Object has been destroyed');
		return parent.bounds;
	};
	return parent;
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

describe('StreamSelector bounds and teardown (#2947)', () => {
	async function shown() {
		const { StreamSelector } = require(selectorPath);
		const parent = fakeParent();
		let result = 'unset';
		new StreamSelector(parent).show((source) => {
			result = source;
		});
		await nextTick();
		return { parent, result: () => result };
	}

	it('re-fits the picker on resize', async () => {
		const { parent } = await shown();
		parent.bounds = { width: 1500, height: 900 };
		parent.emit('resize');
		await nextTick();
		assert.deepStrictEqual(views[0].bounds, { x: 0, y: 0, width: 1500, height: 900 });
	});

	it('re-fits the picker when the parent contentView bounds change (no resize)', async () => {
		const { parent } = await shown();
		assert.deepStrictEqual(views[0].bounds, { x: 0, y: 0, width: 1000, height: 700 });
		parent.bounds = { width: 1920, height: 1080 };
		parent.contentView.emit('bounds-changed');
		await nextTick();
		assert.deepStrictEqual(views[0].bounds, { x: 0, y: 0, width: 1920, height: 1080 });
	});

	it('removes every parent listener when the picker closes', async () => {
		const { parent } = await shown();
		ipcOnce['close-view']();
		for (const event of ['resize', 'closed']) {
			assert.strictEqual((parent.listeners[event] || []).length, 0, event);
		}
		assert.strictEqual((parent.contentView.listeners['bounds-changed'] || []).length, 0);
	});

	it('tears down when the parent window closes, without touching the destroyed parent', async () => {
		const { parent, result } = await shown();
		parent.destroyed = true;
		assert.doesNotThrow(() => parent.emit('closed'));
		assert.strictEqual(result(), null);
		assert.deepStrictEqual(parent.contentView.removed, []);
		assert.strictEqual((parent.listeners.resize || []).length, 0);
		assert.strictEqual((parent.contentView.listeners['bounds-changed'] || []).length, 0);
	});

	it('destroys the picker webContents when the parent closes', async () => {
		const { parent } = await shown();
		parent.destroyed = true;
		parent.emit('closed');
		assert.strictEqual(views[0].webContents.destroyed, true);
	});

	it('finishes teardown even when the selection callback throws', async () => {
		const { StreamSelector } = require(selectorPath);
		const parent = fakeParent();
		new StreamSelector(parent).show(() => {
			throw new Error('Object has been destroyed');
		});
		await nextTick();
		assert.doesNotThrow(() => ipcOnce['close-view']());
		assert.strictEqual(views[0].webContents.destroyed, true);
		assert.deepStrictEqual(parent.contentView.removed, [views[0]]);
		assert.strictEqual((parent.listeners.resize || []).length, 0);
		assert.strictEqual((parent.listeners.closed || []).length, 0);
		assert.strictEqual((parent.contentView.listeners['bounds-changed'] || []).length, 0);
	});

	it('a layout queued before the parent was destroyed does not throw', async () => {
		const { parent } = await shown();
		const uncaught = [];
		const onUncaught = (err) => uncaught.push(err);
		process.on('uncaughtException', onUncaught);
		try {
			parent.emit('resize');
			parent.destroyed = true;
			parent.emit('closed');
			await nextTick();
		} finally {
			process.off('uncaughtException', onUncaught);
		}
		assert.deepStrictEqual(uncaught, []);
	});

	it('does not accumulate closed listeners across shows', async () => {
		const { StreamSelector } = require(selectorPath);
		const parent = fakeParent();
		const selector = new StreamSelector(parent);
		for (let i = 0; i < 3; i++) {
			selector.show(() => {});
			ipcOnce['close-view']();
		}
		assert.strictEqual((parent.listeners.closed || []).length, 0);
	});
});

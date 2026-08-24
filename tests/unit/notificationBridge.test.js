'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const NotificationBridge = require('../../app/browser/notifications/notificationBridge');

// The bridge takes an injected ipcRenderer-shaped emitter, so a plain
// EventEmitter drives it. ipcRenderer delivers (event, ...args), hence the
// leading {} in every emit below.
function makeStub() {
	const calls = [];
	const stub = { onclick: null, onclose: null, calls };
	stub.onclick = function (event) {
		calls.push({ type: 'click', eventType: event.type, target: event.target, self: this });
	};
	stub.onclose = function (event) {
		calls.push({ type: 'close', eventType: event.type, self: this });
	};
	return stub;
}

describe('NotificationBridge', () => {
	let ipc;
	let bridge;
	let originalConsoleDebug;

	beforeEach(() => {
		ipc = new EventEmitter();
		bridge = new NotificationBridge(ipc);
		originalConsoleDebug = console.debug;
		console.debug = () => {};
	});

	afterEach(() => {
		console.debug = originalConsoleDebug;
	});

	it('registers exactly one listener per channel regardless of notification count', () => {
		for (let i = 0; i < 20; i++) bridge.register(`id-${i}`, makeStub());

		assert.strictEqual(ipc.listenerCount('notification-clicked'), 1);
		assert.strictEqual(ipc.listenerCount('notification-closed'), 1);
	});

	it('fires the matching stub onclick with a click event bound to the stub', () => {
		const stub = makeStub();
		bridge.register('id-1', stub);

		ipc.emit('notification-clicked', {}, 'id-1');

		assert.deepStrictEqual(stub.calls.map((c) => [c.type, c.eventType]), [['click', 'click']]);
		assert.strictEqual(stub.calls[0].self, stub, 'handler must be called with `this` === stub');
		assert.strictEqual(stub.calls[0].target, stub, 'event.target must be the stub');
	});

	it('fires a handler registered through addEventListener', () => {
		// createNotificationStub maps addEventListener('click') onto onclick, so
		// the bridge only has to honour the property.
		const stub = { onclick: null, onclose: null };
		let fired = false;
		stub.onclick = () => { fired = true; };
		bridge.register('id-1', stub);

		ipc.emit('notification-clicked', {}, 'id-1');

		assert.strictEqual(fired, true);
	});

	it('routes each id to its own stub and leaves the others alone', () => {
		const a = makeStub();
		const b = makeStub();
		bridge.register('id-a', a);
		bridge.register('id-b', b);

		ipc.emit('notification-clicked', {}, 'id-b');

		assert.strictEqual(a.calls.length, 0);
		assert.deepStrictEqual(b.calls.map((c) => c.type), ['click']);
	});

	it('ignores an unknown id', () => {
		const stub = makeStub();
		bridge.register('id-1', stub);

		ipc.emit('notification-clicked', {}, 'nope');

		assert.strictEqual(stub.calls.length, 0);
	});

	it('fires onclose exactly once whether Teams closes it or the system does', () => {
		const stub = makeStub();
		bridge.register('id-1', stub);

		bridge.close('id-1');
		ipc.emit('notification-closed', {}, 'id-1');

		assert.deepStrictEqual(stub.calls.map((c) => c.type), ['close']);
	});

	it('still delivers a click after close, because the native notification remains clickable', () => {
		const stub = makeStub();
		bridge.register('id-1', stub);

		bridge.close('id-1');
		ipc.emit('notification-clicked', {}, 'id-1');

		assert.deepStrictEqual(stub.calls.map((c) => c.type), ['close', 'click']);
	});

	it('delivers nothing once unregistered', () => {
		const stub = makeStub();
		bridge.register('id-1', stub);
		bridge.unregister('id-1');

		ipc.emit('notification-clicked', {}, 'id-1');
		ipc.emit('notification-closed', {}, 'id-1');

		assert.strictEqual(stub.calls.length, 0);
	});

	it('evicts the oldest entries past the limit instead of growing without bound', () => {
		const small = new NotificationBridge(ipc, { limit: 2 });
		const first = makeStub();
		const last = makeStub();
		small.register('id-1', first);
		small.register('id-2', makeStub());
		small.register('id-3', last);

		ipc.emit('notification-clicked', {}, 'id-1');
		ipc.emit('notification-clicked', {}, 'id-3');

		assert.strictEqual(first.calls.length, 0, 'oldest entry should have been evicted');
		assert.deepStrictEqual(last.calls.map((c) => c.type), ['click']);
	});

	it('does not let a throwing handler swallow the event for other notifications', () => {
		const boom = { onclick: () => { throw new Error('teams blew up'); } };
		const ok = makeStub();
		bridge.register('id-boom', boom);
		bridge.register('id-ok', ok);

		ipc.emit('notification-clicked', {}, 'id-boom');
		ipc.emit('notification-clicked', {}, 'id-ok');

		assert.deepStrictEqual(ok.calls.map((c) => c.type), ['click']);
	});

	it('does nothing when the stub has no handler attached', () => {
		bridge.register('id-1', { onclick: null, onclose: null });

		assert.doesNotThrow(() => ipc.emit('notification-clicked', {}, 'id-1'));
	});
});

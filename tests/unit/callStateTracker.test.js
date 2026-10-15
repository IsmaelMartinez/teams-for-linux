'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const CallStateTracker = require('../../app/mainAppWindow/callStateTracker');

// ADR-032: one entry per reporting renderer, so a disconnect only clears the
// window it came from and "any call active" survives while another call runs.
describe('CallStateTracker', () => {
	it('reports the first connect and keeps any-active until the last disconnect', () => {
		const tracker = new CallStateTracker();
		const main = {};
		const secondary = {};

		assert.deepStrictEqual(tracker.connect(main), { first: true });
		assert.deepStrictEqual(tracker.connect(secondary), { first: false });
		assert.strictEqual(tracker.count, 2);

		assert.deepStrictEqual(tracker.disconnect(main), { wasActive: true, last: false });
		assert.strictEqual(tracker.anyActive, true);
		assert.strictEqual(tracker.has(secondary), true);

		assert.deepStrictEqual(tracker.disconnect(secondary), { wasActive: true, last: true });
		assert.strictEqual(tracker.anyActive, false);
	});

	it('does not let a second connect from the same renderer count twice', () => {
		const tracker = new CallStateTracker();
		const sender = {};
		tracker.connect(sender);
		tracker.connect(sender);
		assert.strictEqual(tracker.count, 1);
		assert.deepStrictEqual(tracker.disconnect(sender), { wasActive: true, last: true });
	});

	it('ignores a disconnect from a renderer that never connected', () => {
		const tracker = new CallStateTracker();
		tracker.connect({});
		assert.deepStrictEqual(tracker.disconnect({}), { wasActive: false, last: false });
		assert.strictEqual(tracker.anyActive, true);
	});

	it('ignores a connect without a sender', () => {
		const tracker = new CallStateTracker();
		assert.deepStrictEqual(tracker.connect(null), { first: false });
		assert.strictEqual(tracker.anyActive, false);
	});

	it('drops a renderer destroyed mid-call and reports it once', () => {
		const tracker = new CallStateTracker();
		const gone = [];
		const sender = new EventEmitter();
		tracker.connect(sender, (wc) => gone.push(wc));

		sender.emit('destroyed');
		assert.strictEqual(tracker.anyActive, false);
		assert.deepStrictEqual(gone, [sender]);

		sender.emit('destroyed');
		assert.strictEqual(gone.length, 1);
	});

	it('does not report a destroyed renderer that already disconnected', () => {
		const tracker = new CallStateTracker();
		const gone = [];
		const sender = new EventEmitter();
		tracker.connect(sender, (wc) => gone.push(wc));
		tracker.disconnect(sender);

		assert.strictEqual(sender.listenerCount('destroyed'), 0);
		sender.emit('destroyed');
		assert.deepStrictEqual(gone, []);
	});
});

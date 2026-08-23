'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const dbusPath = require.resolve('@homebridge/dbus-native');
const emitterPath = require.resolve('../../app/downloadManager/launcherEntryEmitter');

describe('launcherEntryEmitter session bus error handling', () => {
	let connection;
	let sentSignals;

	beforeEach(() => {
		connection = new EventEmitter();
		sentSignals = [];
		require.cache[dbusPath] = {
			id: dbusPath,
			filename: dbusPath,
			loaded: true,
			exports: {
				sessionBus: () => ({
					connection,
					sendSignal: (...args) => sentSignals.push(args),
				}),
			},
		};
		delete require.cache[emitterPath];
	});

	afterEach(() => {
		delete require.cache[dbusPath];
		delete require.cache[emitterPath];
	});

	it('emits Update signals while the bus is healthy', () => {
		const emitter = require(emitterPath);
		emitter.update({ count: 3, countVisible: true });
		assert.strictEqual(sentSignals.length, 1);
	});

	// A dead or stale session bus surfaces as an 'error' event on the
	// connection after connect. Unhandled, that event throws and takes the
	// whole app down; the emitter must swallow it and disable itself.
	it('survives a bus connection error and disables itself', () => {
		const emitter = require(emitterPath);
		emitter.update({ count: 3, countVisible: true });

		assert.doesNotThrow(() => connection.emit('error', new Error('connect ENOENT')));

		emitter.update({ count: 4, countVisible: true });
		assert.strictEqual(sentSignals.length, 1, 'no signal after the bus died');
	});
});

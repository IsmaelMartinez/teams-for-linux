'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const monitorPath = require.resolve('../../app/browser/tools/mqttStatusMonitor');

function withPlatform(platform, run) {
	const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
	Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
	try { run(); } finally { Object.defineProperty(process, 'platform', descriptor); }
}

function withBrowserGlobals(run) {
	const old = {
		document: globalThis.document,
		CustomEvent: globalThis.CustomEvent,
		dispatchEvent: globalThis.dispatchEvent,
	};
	const domEvents = [];
	const dispatched = [];
	globalThis.document = {
		readyState: 'loading',
		addEventListener: (name, listener) => domEvents.push([name, listener]),
	};
	globalThis.CustomEvent = class CustomEvent {
		constructor(name, options) { this.type = name; this.detail = options.detail; }
	};
	globalThis.dispatchEvent = (event) => dispatched.push(event);
	delete require.cache[monitorPath];
	const monitor = require(monitorPath);
	try { run({ monitor, domEvents, dispatched }); } finally {
		monitor.stop();
		delete require.cache[monitorPath];
		for (const [key, value] of Object.entries(old)) {
			if (value === undefined) delete globalThis[key];
			else globalThis[key] = value;
		}
	}
}

describe('MQTTStatusMonitor Linux transport-neutral presence detection', () => {
	it('initializes and invokes presence IPC on Linux with MQTT disabled', () => {
		withPlatform('linux', () => withBrowserGlobals(({ monitor, domEvents, dispatched }) => {
			const calls = [];
			monitor.init({ mqtt: { enabled: false }, dbusControl: { enabled: true } }, { invoke: (...args) => calls.push(args) });
			assert.equal(domEvents[0][0], 'DOMContentLoaded');
			monitor.detectCurrentStatus = () => 3;
			monitor.checkStatusChange();
			assert.deepEqual(calls, [['user-status-changed', { data: { status: 3 } }]]);
			assert.deepEqual(dispatched.map((event) => event.detail), [{ status: 3 }]);
		}));
	});

	it('does not start on non-Linux when MQTT and dock status are disabled', () => {
		withPlatform('darwin', () => withBrowserGlobals(({ monitor, domEvents }) => {
			monitor.init({ mqtt: { enabled: false }, dbusControl: { enabled: true }, media: { showStatusOnDockIcon: false } }, { invoke() {} });
			assert.deepEqual(domEvents, []);
		}));
	});

	it('preserves disabled monitoring and status IPC on Linux without D-Bus opt-in', () => {
		withPlatform('linux', () => withBrowserGlobals(({ monitor, domEvents }) => {
			const calls = [];
			monitor.init({ mqtt: { enabled: false }, dbusControl: { enabled: false } }, { invoke: (...args) => calls.push(args) });
			assert.deepEqual(domEvents, []);
			monitor.detectCurrentStatus = () => 3;
			monitor.checkStatusChange();
			assert.deepEqual(calls, [], 'disabled D-Bus must not update app presence or notification muting');
		}));
	});
});

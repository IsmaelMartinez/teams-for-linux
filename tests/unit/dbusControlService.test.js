'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const DBusControlService = require('../../app/dbus/controlService');

const DEFAULT_NAME = 'com.github.IsmaelMartinez.teams_for_linux';
const OBJECT_PATH = '/com/github/IsmaelMartinez/teams_for_linux';
const INTERFACE_NAME = `${DEFAULT_NAME}.Control`;
const STATE = {
	presenceStatus: 'busy', presenceStatusCode: 2, inCall: true, incomingCall: false,
	incomingCallCaller: null, cameraEnabled: true, microphoneState: 'muted',
	microphoneControlState: 'muted', screenSharing: false, meetingStarted: false,
};

function fixture(options = {}) {
	const connection = new EventEmitter();
	connection.end = options.end || (() => {});
	connection.messages = [];
	connection.message = (message) => connection.messages.push(message);
	const bus = {
		serial: 1,
		connection,
		sessionBusCalls: 0,
		exports: [],
		names: [],
		releases: [],
		sessionBus() {
			return this;
		},
		exportInterface(implementation, path, descriptor) {
			if (options.exportError) throw options.exportError;
			this.exports.push({ implementation, path, descriptor });
		},
		requestName(name, flags, callback) {
			this.names.push({ name, flags, callback });
			if (options.requestError) throw options.requestError;
			if (options.autoReply !== false) {
				callback(options.callbackError || null, options.result ?? 1);
			}
		},
		releaseName(name, callback) {
			this.releases.push(name);
			if (options.releaseError) throw options.releaseError;
			callback?.();
		},
	};
	const dbus = {
		sessionBus() {
			if (options.sessionBusError) throw options.sessionBusError;
			bus.sessionBusCalls += 1;
			return bus;
		},
	};
	const logs = { info: [], warn: [] };
	const logger = {
		info: (message) => logs.info.push(message),
		warn: (message) => logs.warn.push(message),
	};
	const calls = [];
	const control = new EventEmitter();
	control.getState = options.getState || (() => options.state ?? STATE);
	Object.assign(control, Object.fromEntries(['acceptAudio', 'acceptVideo', 'declineCall', 'toggleMute', 'mute', 'unmute', 'toggleVideo', 'toggleHandRaise', 'leaveCall'].map((method) => [
		method,
		(...args) => {
			calls.push([method, ...args]);
			return options.controlResult ?? true;
		},
	])));
	bus.sentSignals = [];
	bus.sendSignal = (...args) => {
		if (options.signalError) throw options.signalError;
		bus.sentSignals.push(args);
	};
	const service = new DBusControlService(control, {
		dbus,
		env: options.env || {},
		platform: options.platform || 'linux',
		logger,
		startupTimeout: options.startupTimeout ?? 1000,
	});
	return { bus, calls, logs, service };
}

describe('DBusControlService', () => {
	it('uses session bus, exact descriptor and default name with DO_NOT_QUEUE', () => {
		const { bus, service } = fixture();
		service.start();
		assert.equal(bus.sessionBusCalls, 1);
		assert.equal(bus.names.length, 1);
		assert.deepEqual(bus.names[0], { name: DEFAULT_NAME, flags: 0x4, callback: bus.names[0].callback });
		assert.equal(bus.exports[0].path, OBJECT_PATH);
		assert.deepEqual(bus.exports[0].descriptor, {
			name: INTERFACE_NAME,
			methods: {
				AcceptAudio: ['', 'b'],
				AcceptVideo: ['', 'b'],
				DeclineCall: ['', 'b'],
				ToggleMute: ['', 'b'], Mute: ['b', 'b'], Unmute: ['b', 'b'],
				ToggleVideo: ['', 'b'], ToggleHandRaise: ['', 'b'], LeaveCall: ['', 'b'],
				GetState: ['', 's'],
			},
			signals: {
				StateChanged: ['s', 'stateJson'], PresenceChanged: ['si', 'status', 'statusCode'],
				InCallChanged: ['b', 'inCall'], IncomingCallChanged: ['b', 'incomingCall'],
				IncomingCallCallerChanged: ['s', 'callerJson'], CameraChanged: ['b', 'enabled'],
				MicrophoneChanged: ['s', 'state'], MicrophoneControlChanged: ['s', 'state'],
				ScreenSharingChanged: ['b', 'sharing'], MeetingStartedChanged: ['b', 'started'],
			},
			properties: {},
		});
	});

	it('uses FLATPAK_ID as the requested bus name', () => {
		const { bus, service } = fixture({ env: { FLATPAK_ID: 'org.example.Teams' } });
		service.start();
		assert.equal(bus.names[0].name, 'org.example.Teams');
	});

	for (const result of [1, 4]) {
		it(`exports methods when requestName reports owner result ${result}`, () => {
			const { bus, service } = fixture({ result });
			service.start();
			assert.equal(bus.exports.length, 1);
			assert.equal(service.active, true);
		});
	}

	it('delegates every command with exact arguments and boolean return values', () => {
		const { bus, calls, service } = fixture();
		service.start();
		const { implementation } = bus.exports[0];
		assert.equal(implementation.AcceptAudio(), true);
		assert.equal(implementation.AcceptVideo(), true);
		assert.equal(implementation.DeclineCall(), true);
		for (const method of ['ToggleMute', 'ToggleVideo', 'ToggleHandRaise', 'LeaveCall']) assert.equal(implementation[method](), true);
		assert.equal(implementation.Mute(true), true);
		assert.equal(implementation.Unmute(false), true);
		assert.deepEqual(calls, [
			['acceptAudio'], ['acceptVideo'], ['declineCall'],
			['toggleMute'], ['toggleVideo'], ['toggleHandRaise'], ['leaveCall'], ['mute', true], ['unmute', false],
		]);
	});

	it('requires actual booleans for forced mute methods and propagates false without dispatch', () => {
		const { bus, calls, service } = fixture(); service.start();
		const api = bus.exports[0].implementation;
		for (const value of [undefined, null, 0, 1, 'true']) {
			assert.equal(api.Mute(value), false); assert.equal(api.Unmute(value), false);
		}
		assert.equal(api.Mute(true), true); assert.equal(api.Unmute(false), true);
		assert.deepEqual(calls, [['mute', true], ['unmute', false]]);
	});

	it('returns a JSON state snapshot, and returns a safe error snapshot on failure', () => {
		const { bus, service } = fixture(); service.start();
		const api = bus.exports[0].implementation;
		const result = api.GetState(); assert.equal(typeof result, 'string'); assert.deepEqual(JSON.parse(result), STATE);
		service.control.getState = () => { throw Error('private'); };
		assert.deepEqual(JSON.parse(api.GetState()), { error: 'State unavailable' });
	});

	it('omits arbitrary shortcut and calendar APIs and ignores their former environment setting', () => {
		const { bus, service } = fixture({ env: { TEAMS_FOR_LINUX_DBUS_CALENDAR_ALLOWED_SENDERS: ':1.42' } });
		service.start();
		const { descriptor, implementation } = bus.exports[0];
		for (const method of ['SendShortcut', 'GetCalendar']) {
			assert.equal(Object.hasOwn(descriptor.methods, method), false);
			assert.equal(Object.hasOwn(implementation, method), false);
		}
		assert.equal(Object.hasOwn(descriptor.signals, 'CalendarReceived'), false);
		assert.equal(service.calendarAllowedSenders, undefined);
		service.stop();
	});

	it('publishes typed state signals only for changed fields and serializes copied snapshots', () => {
		const { bus, service } = fixture(); service.start();
		const snapshot = { ...STATE, incomingCall: true, incomingCallCaller: { name: 'Ada' }, screenSharing: true, meetingStarted: true };
		service.control.emit('state-changed', snapshot);
		assert.deepEqual(bus.sentSignals.map(([, , name, signature]) => [name, signature]), [
			['StateChanged', 's'], ['PresenceChanged', 'si'], ['InCallChanged', 'b'], ['IncomingCallChanged', 'b'],
			['CameraChanged', 'b'], ['MicrophoneChanged', 's'], ['MicrophoneControlChanged', 's'],
			['ScreenSharingChanged', 'b'], ['MeetingStartedChanged', 'b'], ['IncomingCallCallerChanged', 's'],
		]);
		for (const [path, iface, , , args] of bus.sentSignals) { assert.equal(path, OBJECT_PATH); assert.equal(iface, INTERFACE_NAME); assert.ok(Array.isArray(args)); }
		assert.deepEqual(JSON.parse(bus.sentSignals[0][4][0]), snapshot);
		bus.sentSignals.length = 0;
		snapshot.incomingCallCaller.name = 'mutated';
		service.control.emit('state-changed', { ...STATE, incomingCall: true, incomingCallCaller: { name: 'Ada' }, screenSharing: true, meetingStarted: true });
		assert.deepEqual(bus.sentSignals.map(([, , name]) => name), ['StateChanged']);
		assert.deepEqual(service.lastState.incomingCallCaller, { name: 'Ada' });
	});

	it('contains sendSignal errors and removes listeners across stop/restart', async () => {
		const { bus, service, logs } = fixture(); service.start();
		const stateListeners = service.control.listenerCount('state-changed');
		bus.sendSignal = () => { throw Error('bus down'); };
		assert.doesNotThrow(() => service.control.emit('state-changed', STATE));
		assert.ok(logs.warn.length);
		service.stop(); assert.equal(service.control.listenerCount('state-changed'), stateListeners - 1);
		service.start(); assert.equal(service.control.listenerCount('state-changed'), stateListeners);
		service.stop();
	});

	it('does not expose inherited Object prototype handlers', () => {
		const { bus, service } = fixture();
		service.start();
		const implementation = bus.exports[0].implementation;
		assert.equal(Object.getPrototypeOf(implementation), null);
		for (const handler of ['toString', 'constructor', '__defineGetter__']) {
			assert.equal(Object.hasOwn(implementation, handler), false);
		}
	});

	it('returns false for non-boolean delegate results and catches delegate errors without logging input', () => {
		const { bus, service } = fixture({ controlResult: 1 });
		service.start();
		assert.equal(bus.exports[0].implementation.AcceptAudio(), false);
		service.control.toggleMute = () => { throw Error('failure'); };
		assert.equal(bus.exports[0].implementation.ToggleMute(), false);
	});

	it('keeps sessionBus and requestName throws nonfatal', () => {
		const sessionFailure = fixture({ sessionBusError: Error('offline') });
		sessionFailure.service.start();
		assert.equal(sessionFailure.service.bus, null);
		assert.ok(sessionFailure.logs.warn.length);
		const requestFailure = fixture({ requestError: Error('request failed') });
		requestFailure.service.start();
		assert.equal(requestFailure.service.bus, null);
		assert.ok(requestFailure.logs.warn.length);
	});

	it('handles request callback errors and name conflicts nonfatally', () => {
		for (const options of [{ callbackError: Error('callback') }, { result: 2 }, { result: 3 }, { result: 0 }]) {
			const { bus, service, logs } = fixture(options);
			service.start();
			assert.equal(service.active, false);
			assert.equal(bus.exports.length, 0);
			assert.ok(logs.warn.length);
		}
	});

	it('handles export failure and connection error/end without crashing', () => {
		const failedExport = fixture({ exportError: Error('export') });
		failedExport.service.start();
		assert.equal(failedExport.service.active, false);
		assert.equal(failedExport.bus.releases.length, 1);
		for (const event of ['error', 'end']) {
			const { bus, service, logs } = fixture({ autoReply: false });
			service.start();
			bus.connection.emit(event, Error('connection gone'));
			assert.equal(service.bus, null);
			assert.ok(logs.warn.length);
		}
	});

	it('stop releases owned name, ends connection best-effort and is idempotent', () => {
		let endCount = 0;
		const { bus, service } = fixture({ end: () => { endCount += 1; } });
		service.start();
		service.stop();
		service.stop();
		assert.deepEqual(bus.releases, [DEFAULT_NAME]);
		assert.equal(endCount, 1);
		assert.equal(service.active, false);
	});

	it('stop without name ownership does not call releaseName', () => {
		const { bus, service } = fixture({ autoReply: false });
		service.start();
		service.stop();
		assert.deepEqual(bus.releases, []);
	});

	it('exported method returns false after stop without calling control', () => {
		const { bus, calls, service } = fixture();
		service.start();
		const implementation = bus.exports[0].implementation;
		service.stop();
		assert.equal(implementation.AcceptAudio(), false);
		assert.deepEqual(calls, []);
	});

	it('contains releaseName and connection.end failures', () => {
		const { service, logs } = fixture({ releaseError: Error('release'), end: () => { throw Error('end'); } });
		service.start();
		service.stop();
		assert.equal(service.bus, null);
		assert.equal(logs.warn.length, 2);
	});

	it('start twice creates one connection, ignores late name replies and connection errors after stop', () => {
		const { bus, service, logs } = fixture({ autoReply: false });
		service.start();
		service.start();
		assert.equal(bus.names.length, 1);
		const lateReply = bus.names[0].callback;
		service.stop();
		lateReply(null, 1);
		assert.doesNotThrow(() => bus.connection.emit('error', Error('late connection error')));
		assert.equal(bus.exports.length, 0);
		assert.equal(service.active, false);
		assert.equal(logs.warn.some((message) => message.includes('late connection error')), false);
	});

	it('ignores stale replies from a previous connection after restart', () => {
		const connections = [];
		const dbus = { sessionBus: () => {
			const connection = new EventEmitter();
			connection.end = () => {};
			const bus = { connection, implementation: null, exportInterface(implementation) {
				this.implementation = implementation;
			}, requestName(name, flags, callback) {
				this.callback = callback;
			}, releaseName() {} };
			connections.push(bus);
			return bus;
		} };
		const service = new DBusControlService({ acceptAudio: () => true }, { dbus, platform: 'linux', logger: { info() {}, warn() {} } });
		service.start();
		connections[0].callback(null, 1);
		const oldImplementation = connections[0].implementation;
		service.stop();
		service.start();
		connections[1].callback(null, 1);
		assert.equal(service.active, true);
		const newImplementation = connections[1].implementation;
		assert.equal(oldImplementation.AcceptAudio(), false);
		assert.equal(newImplementation.AcceptAudio(), true);
		service.stop();
	});

	it('times out startup and ignores subsequent name callback', async () => {
		const { bus, service } = fixture({ autoReply: false, startupTimeout: 5 });
		service.start();
		const lateReply = bus.names[0].callback;
		await new Promise((resolve) => setTimeout(resolve, 20));
		lateReply(null, 1);
		assert.equal(service.bus, null);
		assert.equal(bus.exports.length, 0);
	});

	it('does not load or connect to D-Bus on non-Linux platforms', () => {
		const service = new DBusControlService({}, { platform: 'darwin', logger: { info() {}, warn() {} } });
		assert.doesNotThrow(() => service.start());
		assert.equal(service.bus, null);
	});
});

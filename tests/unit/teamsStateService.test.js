'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const appEmitter = new EventEmitter();
const ipcEmitter = new EventEmitter();
require.cache[require.resolve('electron')] = {
	id: require.resolve('electron'), exports: { app: appEmitter, ipcMain: ipcEmitter }, loaded: true,
};
const TeamsStateService = require('../../app/control/teamsStateService');

const expectedKeys = [
	'presenceStatus', 'presenceStatusCode', 'inCall', 'incomingCall', 'incomingCallCaller',
	'cameraEnabled', 'microphoneState', 'microphoneControlState', 'screenSharing', 'meetingStarted',
].sort();

describe('TeamsStateService', () => {
	let service;
	beforeEach(() => {
		appEmitter.removeAllListeners();
		ipcEmitter.removeAllListeners();
		service?.dispose();
		service = new TeamsStateService({ mqtt: { enabled: false, incomingCallCaller: { enabled: true }, meetingStartDetection: { resetSeconds: 1 } } });
		service.initialize();
	});

	it('provides stable complete clone snapshots and publishes presence/media/call state without MQTT', () => {
		const events = [];
		service.on('state-changed', (state) => events.push(state));
		service.setPresence(2);
		ipcEmitter.emit('camera-state-changed', {}, true);
		ipcEmitter.emit('microphone-state-changed', {}, 'muted');
		ipcEmitter.emit('screen-sharing-started');
		appEmitter.emit('teams-call-connected');
		const snapshot = service.getState();
		assert.deepEqual(Object.keys(snapshot).sort(), expectedKeys);
		assert.equal(snapshot.presenceStatus, 'busy');
		assert.equal(snapshot.presenceStatusCode, 2);
		assert.equal(snapshot.cameraEnabled, true);
		assert.equal(snapshot.microphoneState, 'muted');
		assert.equal(snapshot.microphoneControlState, 'muted');
		assert.equal(snapshot.screenSharing, true);
		assert.equal(snapshot.inCall, true);
		assert.ok(events.length >= 5);
		snapshot.incomingCallCaller = { name: 'mutated' };
		assert.deepEqual(service.getState().incomingCallCaller, null);
		snapshot.incomingCall = true;
		assert.equal(service.getState().incomingCall, false);
	});

	it('bounds presence to int32 while mapping unknown in-range values to unknown', () => {
		assert.equal(service.setPresence(99), true);
		assert.equal(service.getState().presenceStatus, 'unknown');
		assert.equal(service.getState().presenceStatusCode, 99);
		for (const invalid of [1.5, NaN, Infinity, 2_147_483_648, -2_147_483_649, '2']) {
			assert.equal(service.setPresence(invalid), false);
		}
	});

	it('sanitizes opt-in caller details and clears them when the ring ends', () => {
		appEmitter.emit('teams-incoming-call-started', {
			name: 'Caller', number: '+1555', callId: 'id', image: 'private', nested: { x: 1 },
		});
		assert.deepEqual(service.getState().incomingCallCaller, { name: 'Caller', number: '+1555', callId: 'id' });
		const snapshot = service.getState();
		snapshot.incomingCallCaller.name = 'mutated';
		assert.equal(service.getState().incomingCallCaller.name, 'Caller', 'nested caller data is detached');
		appEmitter.emit('teams-incoming-call-ended');
		assert.equal(service.getState().incomingCall, false);
		assert.equal(service.getState().incomingCallCaller, null);
	});

	it('does not expose caller fields unless opted in', () => {
		service.dispose();
		service = new TeamsStateService({ mqtt: {} });
		service.initialize();
		appEmitter.emit('teams-incoming-call-started', { name: 'Caller' });
		assert.equal(service.getState().incomingCall, true);
		assert.equal(service.getState().incomingCallCaller, null);
	});

	it('maps microphone state, deduplicates snapshots and turns it off on call disconnect', () => {
		const snapshots = [];
		service.on('state-changed', (state) => snapshots.push(state));
		ipcEmitter.emit('microphone-state-changed', {}, 'silent');
		ipcEmitter.emit('microphone-state-changed', {}, 'silent');
		ipcEmitter.emit('microphone-state-changed', {}, 'speaking');
		assert.deepEqual(snapshots.map((state) => state.microphoneState), ['silent', 'speaking']);
		assert.deepEqual(snapshots.map((state) => state.microphoneControlState), ['unmuted', 'unmuted']);
		appEmitter.emit('teams-call-disconnected');
		assert.equal(service.getState().microphoneState, 'off');
		assert.equal(service.getState().microphoneControlState, 'off');
		assert.deepEqual(snapshots.map((state) => state.microphoneControlState), ['unmuted', 'unmuted', 'off']);
	});

	it('rejects invalid microphone payloads before changing global or per-profile state', () => {
		const mqttControls = [];
		appEmitter.on('teams-microphone-control-changed', (state) => mqttControls.push(state));
		const active = {};
		service.dispose();
		service = new TeamsStateService({ mqtt: {} }, { getActiveWebContents: () => active });
		service.initialize();
		const changes = [];
		service.on('state-changed', (state) => changes.push(state));
		for (const invalid of [null, {}, 1, 'mystery', 'Muted']) {
			ipcEmitter.emit('microphone-state-changed', { sender: active }, invalid);
		}
		assert.equal(service.getState().microphoneState, 'unknown');
		assert.equal(service.getState().microphoneControlState, 'unknown');
		assert.deepEqual(changes, []);
		assert.deepEqual(mqttControls, []);
	});

	it('keeps D-Bus microphone observations separate from the legacy MQTT app event', () => {
		const mqttControls = [];
		const snapshots = [];
		appEmitter.on('teams-microphone-control-changed', (state) => mqttControls.push(state));
		service.on('state-changed', (snapshot) => snapshots.push(snapshot));
		ipcEmitter.emit('microphone-state-changed', {}, 'muted');
		ipcEmitter.emit('microphone-state-changed', {}, 'silent');
		assert.deepEqual(mqttControls, [], 'D-Bus must not change MQTT command guard state or timing');
		assert.deepEqual(snapshots.map((state) => state.microphoneControlState), ['muted', 'unmuted']);
	});

	it('expires meeting pulse after the configured delay', async () => {
		service.dispose();
		service = new TeamsStateService({ mqtt: { meetingStartDetection: { resetSeconds: 0.06 } } });
		service.initialize();
		ipcEmitter.emit('meeting-started');
		assert.equal(service.getState().meetingStarted, true);
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(service.getState().meetingStarted, false);
	});

	it('restarts the meeting pulse timer on repeat detections', async () => {
		service.dispose();
		service = new TeamsStateService({ mqtt: { meetingStartDetection: { resetSeconds: 0.12 } } });
		service.initialize();
		ipcEmitter.emit('meeting-started');
		await new Promise((resolve) => setTimeout(resolve, 75));
		ipcEmitter.emit('meeting-started');
		await new Promise((resolve) => setTimeout(resolve, 75));
		assert.equal(service.getState().meetingStarted, true);
		await new Promise((resolve) => setTimeout(resolve, 75));
		assert.equal(service.getState().meetingStarted, false);
	});

	it('clears the meeting pulse on call connect and dispose cancels timers idempotently', async () => {
		service.dispose();
		service = new TeamsStateService({ mqtt: { meetingStartDetection: { resetSeconds: 0.08 } } });
		service.initialize();
		service.initialize();
		assert.equal(ipcEmitter.listenerCount('meeting-started'), 1);
		ipcEmitter.emit('meeting-started');
		assert.equal(service.getState().meetingStarted, true);
		appEmitter.emit('teams-call-connected');
		assert.equal(service.getState().meetingStarted, false);
		ipcEmitter.emit('meeting-started');
		const stateBeforeDispose = service.getState();
		service.dispose();
		service.dispose();
		ipcEmitter.emit('meeting-started');
		appEmitter.emit('teams-call-connected');
		await new Promise((resolve) => setTimeout(resolve, 120));
		assert.deepEqual(service.getState(), stateBeforeDispose);
		for (const event of [
			'camera-state-changed', 'microphone-state-changed', 'screen-sharing-started',
			'screen-sharing-stopped', 'meeting-started',
		]) assert.equal(ipcEmitter.listenerCount(event), 0, `${event} listener removed`);
		for (const event of [
			'teams-call-connected', 'teams-call-disconnected',
			'teams-incoming-call-started', 'teams-incoming-call-ended',
		]) assert.equal(appEmitter.listenerCount(event), 0, `${event} listener removed`);
	});

	it('does not clear the active profile microphone when a background account disconnects', () => {
		const profileA = {};
		const profileB = {};
		let current = profileA;
		service.dispose();
		service = new TeamsStateService({ mqtt: {} }, { getActiveWebContents: () => current });
		service.initialize();
		ipcEmitter.emit('microphone-state-changed', { sender: profileA }, 'muted');
		current = profileB;
		ipcEmitter.emit('microphone-state-changed', { sender: profileB }, 'speaking');
		appEmitter.emit('teams-call-disconnected', profileA);
		assert.equal(service.getState().microphoneControlState, 'unmuted');
		current = profileA;
		assert.equal(service.getState().microphoneControlState, 'off');
	});

	it('attributes call, camera, sharing, presence and meeting state to the selected profile', () => {
		const a = {};
		const b = {};
		let active = a;
		service.dispose();
		service = new TeamsStateService({}, { getActiveWebContents: () => active });
		service.initialize();
		appEmitter.emit('teams-call-connected', a);
		ipcEmitter.emit('camera-state-changed', { sender: a }, true);
		ipcEmitter.emit('screen-sharing-started', { sender: a });
		service.setPresence(2, a);
		const events = [];
		service.on('state-changed', (snapshot) => events.push(snapshot));
		appEmitter.emit('teams-call-connected', b);
		appEmitter.emit('teams-call-disconnected', b);
		ipcEmitter.emit('camera-state-changed', { sender: b }, false);
		ipcEmitter.emit('screen-sharing-stopped', { sender: b });
		ipcEmitter.emit('meeting-started', { sender: b });
		service.setPresence(4, b);
		assert.deepEqual(events, [], 'background events cannot emit active-profile state changes');
		assert.equal(service.getState().inCall, true);
		assert.equal(service.getState().cameraEnabled, true);
		assert.equal(service.getState().screenSharing, true);
		assert.equal(service.getState().presenceStatus, 'busy');
		assert.equal(service.getState().meetingStarted, false);
		active = b;
		assert.equal(service.getState().inCall, false);
		assert.equal(service.getState().cameraEnabled, false);
		assert.equal(service.getState().screenSharing, false);
		assert.equal(service.getState().presenceStatus, 'away');
		assert.equal(service.getState().meetingStarted, true);
		active = {};
		assert.equal(service.getState().inCall, false);
		assert.equal(service.getState().presenceStatus, 'unknown');
		active = null;
		ipcEmitter.emit('camera-state-changed', { sender: a }, false);
		assert.equal(service.getState().cameraEnabled, false);
		assert.equal(service.getState().microphoneControlState, 'unknown');
		service.dispose();
	});

	it('keeps unknown active-profile mic state separate and ignores inactive updates', () => {
		const profileA = {};
		const profileB = {};
		let current = profileA;
		service.dispose();
		service = new TeamsStateService({ mqtt: {} }, { getActiveWebContents: () => current });
		service.initialize();
		ipcEmitter.emit('microphone-state-changed', { sender: profileA }, 'muted');
		current = profileB;
		const stateEvents = [];
		service.on('state-changed', (state) => stateEvents.push(state));
		ipcEmitter.emit('microphone-state-changed', { sender: profileA }, 'speaking');
		assert.deepEqual(stateEvents, [], 'inactive profile updates do not notify active state consumers');
		assert.equal(service.getState().microphoneControlState, 'unknown');
		ipcEmitter.emit('microphone-state-changed', { sender: profileB }, 'muted');
		assert.equal(service.getState().microphoneControlState, 'muted');
		assert.equal(stateEvents.length, 1, 'active profile emits even if another profile had the same global value');
		ipcEmitter.emit('microphone-state-changed', { sender: profileB }, 'speaking');
		assert.equal(service.getState().microphoneControlState, 'unmuted');
		assert.equal(stateEvents.length, 2);
		current = profileA;
		assert.equal(service.getState().microphoneControlState, 'unmuted', 'the inactive profile state is retained for its next activation');
	});
});

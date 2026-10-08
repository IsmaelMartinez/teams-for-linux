'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const TeamsControlService = require('../../app/control/teamsControlService');

function fixture(state = {}) {
	const stateService = new EventEmitter();
	const snapshot = { microphoneControlState: 'unknown', ...state };
	stateService.getState = () => ({
		presenceStatus: 'unknown', presenceStatusCode: -1, inCall: false, incomingCall: false,
		incomingCallCaller: null, cameraEnabled: false, microphoneState: 'unknown',
		microphoneControlState: 'unknown', screenSharing: false, meetingStarted: false, ...snapshot,
	});
	const keyEvents = [];
	const contents = { isDestroyed: () => false, sendInputEvent: (event) => keyEvents.push(event) };
	const control = new TeamsControlService({
		getShortcutWebContents: () => contents,
		performIncomingCallAction: () => true,
		stateService,
	});
	return { control, keyEvents, stateService };
}

describe('TeamsControlService transport-neutral controls', () => {
	it('fails every shortcut control closed when the selected profile renderer is unavailable', () => {
		const source = fs.readFileSync(require.resolve('../../app/index.js'), 'utf8');
		const start = source.indexOf('function getControlWebContents()');
		const end = source.indexOf('\nfunction handleShortcutCommand(', start);
		const sent = [];
		const root = { isDestroyed: () => false, sendInputEvent: (event) => sent.push(event) };
		const context = {
			profileViewManager: { getActiveWebContents: () => null },
			mainAppWindow: { getWindow: () => ({ isDestroyed: () => false, webContents: root }) },
		};
		vm.createContext(context);
		vm.runInContext(source.slice(start, end), context);
		const { control } = fixture();
		control.getShortcutWebContents = context.getControlWebContents;
		for (const action of ['toggleMute', 'toggleVideo', 'toggleHandRaise', 'leaveCall']) assert.equal(control[action](), false);
		assert.equal(control.mute(true), false);
		assert.equal(control.unmute(true), false);
		assert.deepEqual(sent, []);
	});
	it('forwards full state snapshots and detaches on dispose', () => {
		const { control, stateService } = fixture();
		let observed;
		control.on('state-changed', (value) => { observed = value; });
		stateService.emit('state-changed', { inCall: true, incomingCall: false });
		assert.deepEqual(Object.keys(observed).sort(), [
			'presenceStatus', 'presenceStatusCode', 'inCall', 'incomingCall', 'incomingCallCaller',
			'cameraEnabled', 'microphoneState', 'microphoneControlState', 'screenSharing', 'meetingStarted',
		].sort());
		assert.equal(observed.inCall, false);
		observed.inCall = true;
		assert.equal(control.getState().inCall, false, 'returned snapshots are detached copies');
		control.dispose();
		stateService.emit('state-changed', { inCall: false });
		assert.equal(observed.inCall, true);
	});

	it('dispatches each shortcut with exact keyDown/keyUp and modifiers', () => {
		for (const [method, keyCode] of [
			['toggleMute', 'M'], ['mute', 'M'], ['unmute', 'M'],
			['toggleVideo', 'O'], ['toggleHandRaise', 'K'], ['leaveCall', 'H'],
		]) {
			const { control, keyEvents } = fixture({ microphoneControlState: method === 'unmute' ? 'muted' : 'unmuted' });
			const result = method === 'mute' ? control.mute()
				: method === 'unmute' ? control.unmute() : control[method]();
			assert.equal(result, true, `${method} dispatches`);
			assert.deepEqual(keyEvents, [
				{ type: 'keyDown', keyCode, modifiers: ['control', 'shift'] },
				{ type: 'keyUp', keyCode, modifiers: ['control', 'shift'] },
			]);
		}
	});

	it('returns false for destroyed renderers and failed or partial input dispatch', () => {
		for (const failAt of [1, 2]) {
			const { control } = fixture();
			let attempted = 0;
			control.getShortcutWebContents = () => ({
				isDestroyed: () => false,
				sendInputEvent() {
					attempted += 1;
					if (attempted === failAt) throw new Error('Renderer input failed');
				},
			});
			assert.equal(control.toggleMute(), false);
			assert.equal(attempted, failAt);
		}
		const { control } = fixture();
		control.getShortcutWebContents = () => ({
			isDestroyed: () => true,
			sendInputEvent() { assert.fail('A destroyed renderer must not receive input'); },
		});
		assert.equal(control.toggleVideo(), false);
	});

	it('mutes/unmutes only when needed, rejects unknown/off without force, and force always toggles unknown', () => {
		for (const [method, current, force, expected] of [
			['mute', 'muted', false, false], ['mute', 'unmuted', false, true],
			['unmute', 'unmuted', false, false], ['unmute', 'muted', false, true],
			['mute', 'unknown', false, false], ['unmute', 'unknown', false, false],
			['mute', 'off', false, false], ['unmute', 'off', false, false],
			['mute', 'unknown', true, true], ['unmute', 'off', true, true],
		]) {
			const { control, keyEvents } = fixture({ microphoneControlState: current });
			const result = control[method](force);
			assert.equal(result, expected, `${method} from ${current} force=${force}`);
			assert.equal(keyEvents.length, expected ? 2 : 0, 'no-dispatch cases send no key events');
		}
		const { control, keyEvents } = fixture({ microphoneControlState: 'unknown' });
		assert.equal(control.mute('true'), false, 'force accepts booleans only');
		assert.equal(keyEvents.length, 0);
	});

});

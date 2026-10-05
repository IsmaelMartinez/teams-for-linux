'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');

const electronPath = require.resolve('electron');
const statePath = require.resolve('../../app/control/teamsStateService');
const mediaPath = require.resolve('../../app/mqtt/mediaStatusService');

it('preserves the original shortcut exports and dispatch used alongside D-Bus', () => {
	const source = fs.readFileSync(require.resolve('../../app/globalShortcuts'), 'utf8');
	const context = {
		require: (name) => name === 'electron' ? { globalShortcut: {} } : require(name),
		module: { exports: {} },
		console: { debug() {}, error() {} },
	};
	vm.runInNewContext(source, context);
	const shortcuts = context.module.exports;
	assert.deepEqual(Object.keys(shortcuts).sort(), ['register', 'sendKeyboardEventToWindow']);
	const sent = [];
	const webContents = { isDestroyed: () => false, sendInputEvent: (event) => sent.push(event) };
	shortcuts.sendKeyboardEventToWindow({ webContents }, 'Control+a');
	assert.equal(sent[0].keyCode, 'a', 'legacy key casing must not change');
	shortcuts.sendKeyboardEventToWindow({ webContents }, 'Control+Shift+CustomKey');
	assert.equal(sent[2].keyCode, 'CustomKey', 'legacy parser must not acquire the D-Bus key allowlist');
	assert.equal(sent.length, 4);
});

it('keeps MQTT publications and its app event unchanged when D-Bus observes the same IPC', async () => {
	const saved = new Map([electronPath, statePath, mediaPath].map((path) => [path, require.cache[path]]));
	const app = new EventEmitter();
	const ipcMain = new EventEmitter();
	const config = { mqtt: { enabled: true, topicPrefix: 'teams', clientId: 'test-client' } };
	const publications = [];
	const mqtt = { async publish(...args) { publications.push(args); } };
	let state;
	try {
		require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: { app, ipcMain } };
		delete require.cache[statePath];
		delete require.cache[mediaPath];
		const TeamsStateService = require(statePath);
		const MQTTMediaStatusService = require(mediaPath);
		state = new TeamsStateService(config);
		state.initialize();
		new MQTTMediaStatusService(mqtt, config).initialize();
		const mqttControls = [];
		const dbusStates = [];
		app.on('teams-microphone-control-changed', (value) => mqttControls.push(value));
		state.on('state-changed', (value) => dbusStates.push(value));
		for (const value of ['muted', 'speaking', 'silent', 'silent']) {
			ipcMain.emit('microphone-state-changed', { sender: {} }, value);
			await new Promise((resolve) => setImmediate(resolve));
		}
		assert.deepEqual(mqttControls, ['muted', 'unmuted'], 'only the original MQTT producer updates the legacy app event');
		assert.deepEqual(publications, [
			['teams/microphone', 'muted', { retain: true }],
			['teams/microphone/control', 'muted', { retain: true }],
			['teams/microphone', 'speaking', { retain: true }],
			['teams/microphone/control', 'unmuted', { retain: true }],
			['teams/microphone', 'silent', { retain: true }],
		]);
		assert.deepEqual(dbusStates.map((value) => value.microphoneState), ['muted', 'speaking', 'silent']);
		assert.equal(state.getState().microphoneControlState, 'unmuted');
	} finally {
		state?.dispose();
		app.removeAllListeners();
		ipcMain.removeAllListeners();
		for (const [path, entry] of saved) {
			if (entry) require.cache[path] = entry;
			else delete require.cache[path];
		}
	}
});

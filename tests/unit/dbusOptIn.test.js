'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const options = require('../../app/config/options');

it('defines D-Bus as disabled by default and requiring restart', () => {
	assert.deepEqual(options.dbusControl.default, { enabled: false });
	assert.equal(options.dbusControl.fields.enabled.type, 'boolean');
	assert.equal(options.dbusControl.applyMode, 'restart');
});

it('registers profile-switch refresh only when D-Bus control and multiple accounts are enabled', () => {
	const source = fs.readFileSync(require.resolve('../../app/index.js'), 'utf8');
	const start = source.indexOf('if (teamsControlService && config.multiAccount?.enabled)');
	const end = source.indexOf('initializeQuickChat();', start);
	assert.ok(start >= 0 && end > start);
	for (const enabled of [false, true]) {
		for (const multiAccount of [false, true]) {
			const profilesManager = new EventEmitter();
			let refreshed = 0;
			const context = {
				config: { multiAccount: { enabled: multiAccount } }, profilesManager,
				teamsControlService: enabled ? { refreshState() { refreshed++; } } : null,
				setImmediate: (callback) => callback(),
			};
			vm.runInNewContext(source.slice(start, end), context);
			assert.equal(profilesManager.listenerCount('switch'), enabled && multiAccount ? 1 : 0);
			profilesManager.emit('switch');
			assert.equal(refreshed, enabled && multiAccount ? 1 : 0);
		}
	}
});

it('starts D-Bus and its state observers only for explicit Linux opt-in', () => {
	const source = fs.readFileSync(require.resolve('../../app/index.js'), 'utf8');
	const helperStart = source.indexOf('function initializeDbusControl() {');
	const helperEnd = source.indexOf('async function handleAppReady() {', helperStart);
	assert.ok(helperStart >= 0 && helperEnd > helperStart);
	assert.equal(source.split('initializeDbusControl();').length - 1, 1, 'handleAppReady calls the helper once');
	for (const [platform, config, expected] of [
		['linux', {}, 0], ['linux', { dbusControl: { enabled: false } }, 0],
		['linux', { dbusControl: { enabled: 'true' } }, 0],
		['linux', { dbusControl: { enabled: true } }, 1],
		['darwin', { dbusControl: { enabled: true } }, 0],
		['win32', { dbusControl: { enabled: true } }, 0],
	]) {
		const started = { state: 0, control: 0, bus: 0 };
		const context = {
			process: { platform }, config, teamsStateService: null, teamsControlService: null, dbusControlService: null,
			getControlWebContents() {}, mainAppWindow: { performIncomingCallAction() {} },
			TeamsStateService: class { initialize() { started.state++; } },
			TeamsControlService: class { constructor() { started.control++; } },
			require: () => class { start() { started.bus++; } }, console,
		};
		vm.runInNewContext(`${source.slice(helperStart, helperEnd)}\ninitializeDbusControl();`, context);
		assert.deepEqual(started, { state: expected, control: expected, bus: expected }, `${platform}: ${JSON.stringify(config)}`);
	}
});

'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

// --- browser tool -----------------------------------------------------------

const toolPath = require.resolve('../../app/browser/tools/callParticipants');
const activityHubPath = require.resolve('../../app/browser/tools/activityHub');

// A stage tile: the outline element whose parent holds the display name.
function tile(name, opacity) {
	return { parentElement: { innerText: name }, opacity };
}
function stage(...tiles) {
	return { querySelectorAll: (sel) => (sel === '[data-tid="voice-level-stream-outline"]' ? tiles : []) };
}
const styleOf = (el, pseudo) => (pseudo === '::before' ? { opacity: String(el.opacity) } : {});

function loadTool() {
	const hub = new EventEmitter();
	delete require.cache[toolPath];
	require.cache[activityHubPath] = { id: activityHubPath, exports: { on: (e, h) => hub.on(e, h) }, loaded: true };
	return { tool: require(toolPath), hub };
}

describe('callParticipants readStage', () => {
	const { tool } = loadTool();

	it('lists stage tiles by name with the speaking outline, sorted', () => {
		const doc = stage(tile('Zoe Park', '0'), tile('Ada Lovelace', '1'));
		assert.deepEqual(tool.readStage(doc, styleOf), [
			{ name: 'Ada Lovelace', speaking: true },
			{ name: 'Zoe Park', speaking: false },
		]);
	});

	it('uses the first line of the tile text and skips tiles without a name', () => {
		const doc = stage(tile('\n  Ada Lovelace \n(Guest)', '0'), tile('   ', '1'), { parentElement: null });
		assert.deepEqual(tool.readStage(doc, styleOf), [{ name: 'Ada Lovelace', speaking: false }]);
	});

	it('merges duplicate tiles for one person, speaking wins', () => {
		const doc = stage(tile('Ada', '0'), tile('Ada', '1'), tile('Ada', '0'));
		assert.deepEqual(tool.readStage(doc, styleOf), [{ name: 'Ada', speaking: true }]);
	});

	it('treats an unreadable or partial outline as not speaking', () => {
		const throwing = () => { throw new Error('detached'); };
		assert.deepEqual(tool.readStage(stage(tile('Ada', '1')), throwing), [{ name: 'Ada', speaking: false }]);
		assert.deepEqual(tool.readStage(stage(tile('Ada', '0.4')), styleOf), [{ name: 'Ada', speaking: false }]);
		assert.deepEqual(tool.readStage(stage(tile('Ada', 'x')), styleOf), [{ name: 'Ada', speaking: false }]);
	});

	it('caps names at 128 characters and the list at 100 people', () => {
		const long = 'x'.repeat(300);
		assert.equal(tool.readStage(stage(tile(long, '0')), styleOf)[0].name.length, 128);
		const many = Array.from({ length: 150 }, (_, i) => tile(`P${String(i).padStart(3, '0')}`, '0'));
		assert.equal(tool.readStage(stage(...many), styleOf).length, 100);
	});

	it('returns an empty list without a document', () => {
		assert.deepEqual(tool.readStage(undefined, styleOf), []);
	});
});

describe('callParticipants init and polling', () => {
	const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
	const setPlatform = (value) => Object.defineProperty(process, 'platform', { value, configurable: true });
	const enabled = { dbusControl: { enabled: true, callParticipants: true } };

	beforeEach(() => {
		mock.timers.enable({ apis: ['setInterval'] });
		globalThis.getComputedStyle = styleOf;
	});
	afterEach(() => {
		mock.timers.reset();
		Object.defineProperty(process, 'platform', realPlatform);
		delete globalThis.document;
		delete globalThis.getComputedStyle;
	});

	for (const [label, platform, config] of [
		['off by default', 'linux', {}],
		['needs dbusControl.enabled', 'linux', { dbusControl: { callParticipants: true } }],
		['needs dbusControl.callParticipants', 'linux', { dbusControl: { enabled: true } }],
		['Linux only', 'darwin', enabled],
	]) {
		it(`stays inactive: ${label}`, () => {
			setPlatform(platform);
			const { tool, hub } = loadTool();
			const ipc = { send: mock.fn() };
			tool.init(config, ipc);
			assert.equal(hub.listenerCount('call-connected'), 0);
			assert.equal(ipc.send.mock.callCount(), 0);
		});
	}

	it('polls only in a call, sends on change only, and clears on hang-up', () => {
		setPlatform('linux');
		const { tool, hub } = loadTool();
		const ipc = { send: mock.fn() };
		tool.init(enabled, ipc);
		const ada = tile('Ada', '0');
		globalThis.document = stage(ada);

		mock.timers.tick(2000);
		assert.equal(ipc.send.mock.callCount(), 0, 'nothing before the call starts');

		hub.emit('call-connected');
		mock.timers.tick(500);
		assert.deepEqual(ipc.send.mock.calls.at(-1).arguments, ['call-participants-changed', [{ name: 'Ada', speaking: false }]]);
		mock.timers.tick(1500);
		assert.equal(ipc.send.mock.callCount(), 1, 'unchanged stage is not resent');

		ada.opacity = '1';
		mock.timers.tick(500);
		assert.deepEqual(ipc.send.mock.calls.at(-1).arguments[1], [{ name: 'Ada', speaking: true }]);

		hub.emit('call-disconnected');
		assert.deepEqual(ipc.send.mock.calls.at(-1).arguments, ['call-participants-changed', []]);
		const sent = ipc.send.mock.callCount();
		mock.timers.tick(2000);
		assert.equal(ipc.send.mock.callCount(), sent, 'polling stops after the call');
	});
});

// --- main-process state ------------------------------------------------------

const appEmitter = new EventEmitter();
const ipcEmitter = new EventEmitter();
require.cache[require.resolve('electron')] = {
	id: require.resolve('electron'), exports: { app: appEmitter, ipcMain: ipcEmitter }, loaded: true,
};
const TeamsStateService = require('../../app/control/teamsStateService');

describe('TeamsStateService callParticipants', () => {
	let service;
	const make = (dbusControl) => {
		appEmitter.removeAllListeners();
		ipcEmitter.removeAllListeners();
		service?.dispose();
		service = new TeamsStateService({ dbusControl });
		service.initialize();
		return service;
	};

	it('ignores participants unless both D-Bus switches are on', () => {
		for (const dbusControl of [undefined, { enabled: true }, { callParticipants: true }]) {
			make(dbusControl);
			ipcEmitter.emit('call-participants-changed', {}, [{ name: 'Ada', speaking: true }]);
			assert.equal(service.getState().callParticipants, null);
		}
	});

	it('publishes a sanitized copy and clears it when the call ends', () => {
		make({ enabled: true, callParticipants: true });
		const events = [];
		service.on('state-changed', (state) => events.push(state.callParticipants));
		ipcEmitter.emit('call-participants-changed', {}, [
			{ name: '  Ada  ', speaking: true, extra: 'dropped' },
			{ name: 'Bob', speaking: 'yes' },
			{ name: '' }, null, 'Eve', { name: 42 },
		]);
		assert.deepEqual(service.getState().callParticipants, [{ name: 'Ada', speaking: true }, { name: 'Bob', speaking: false }]);

		ipcEmitter.emit('call-participants-changed', {}, [{ name: 'Ada', speaking: true }, { name: 'Bob', speaking: false }]);
		assert.equal(events.length, 1, 'an identical list does not emit again');

		appEmitter.emit('teams-call-disconnected');
		assert.equal(service.getState().callParticipants, null);
	});

	it('maps an empty list to null and rejects non-arrays', () => {
		make({ enabled: true, callParticipants: true });
		ipcEmitter.emit('call-participants-changed', {}, [{ name: 'Ada', speaking: false }]);
		ipcEmitter.emit('call-participants-changed', {}, 'not a list');
		assert.deepEqual(service.getState().callParticipants, [{ name: 'Ada', speaking: false }]);
		ipcEmitter.emit('call-participants-changed', {}, []);
		assert.equal(service.getState().callParticipants, null);
	});

	it('bounds names and list length', () => {
		make({ enabled: true, callParticipants: true });
		const many = Array.from({ length: 150 }, (_, i) => ({ name: `${'n'.repeat(200)}${i}`, speaking: false }));
		ipcEmitter.emit('call-participants-changed', {}, many);
		const list = service.getState().callParticipants;
		assert.equal(list.length, 100);
		assert.ok(list.every((p) => p.name.length === 128));
	});
});

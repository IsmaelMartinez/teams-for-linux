'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');

const appEmitter = new EventEmitter();
const ipcEmitter = new EventEmitter();
require.cache[require.resolve('electron')] = {
	id: require.resolve('electron'), exports: { app: appEmitter, ipcMain: ipcEmitter }, loaded: true,
};

const contract = require('../../app/control/contract');
const options = require('../../app/config/options');
const generator = require('../../scripts/generateControlDocs');
const { getMediaTopics } = require('../../app/mqtt/mediaTopics');
const { applyObjectDefaults } = require('../../app/config/mergeDefaults');
const { MQTTClient } = require('../../app/mqtt');
const MQTTMediaStatusService = require('../../app/mqtt/mediaStatusService');
const TeamsControlService = require('../../app/control/teamsControlService');
const TeamsStateService = require('../../app/control/teamsStateService');
const DBusControlService = require('../../app/dbus/controlService');

const { shared, mqtt, dbus } = contract;
const REGENERATE = 'run `npm run generate-control-docs` and commit the result';

describe('contract completeness', () => {
	it('passes the generator lint', () => {
		assert.deepEqual(generator.lintContract(), []);
	});

	// Breaks one entry, lints, and restores it, so each area is shown to report an incomplete entry.
	const lintWith = (target, key, value) => {
		const original = target[key];
		target[key] = value;
		try {
			return generator.lintContract();
		} finally {
			target[key] = original;
		}
	};

	it('reports an incomplete state entry', () => {
		assert.ok(lintWith(shared.state[0], 'description', '').includes('state "presenceStatus" is missing a description'));
		assert.ok(lintWith(shared.state[0], 'personalData', undefined).includes('state "presenceStatus" is missing personalData (true or false)'));
	});

	it('reports an incomplete MQTT topic', () => {
		assert.ok(lintWith(mqtt.topics[0], 'retained', undefined).includes('MQTT topic "status" is missing retained (true or false)'));
		assert.ok(lintWith(mqtt.topics[0], 'state', ['nope']).includes('MQTT topic "status" carries unknown state field "nope"'));
	});

	it('reports an incomplete D-Bus method and signal', () => {
		assert.ok(lintWith(dbus.methods.Mute, 'command', 'nope').includes('D-Bus method "Mute" names unknown command "nope"'));
		assert.ok(lintWith(dbus.signals.InCallChanged, 'state', []).includes('D-Bus signal "InCallChanged" carries no state field'));
	});

	it('declares the state fields in the order of the snapshot', () => {
		const service = new TeamsStateService({});
		assert.deepEqual(shared.state.map(({ field }) => field), Object.keys(service.getState()));
	});

	it('is plain data: loads in a context with no require and survives a JSON round trip', () => {
		const sandbox = { module: { exports: {} } };
		vm.runInNewContext(fs.readFileSync(require.resolve('../../app/control/contract'), 'utf8'), sandbox);
		assert.deepEqual(JSON.parse(JSON.stringify(sandbox.module.exports)), contract);
	});
});

describe('generated reference', () => {
	it('matches the contract on disk (drift guard)', () => {
		assert.equal(
			fs.readFileSync(generator.DOCS_OUTPUT, 'utf8'), generator.generateMarkdown(),
			`docs-site/docs/automation-contract-generated.md is stale: ${REGENERATE}`,
		);
		assert.equal(
			fs.readFileSync(generator.ASYNCAPI_OUTPUT, 'utf8'), generator.renderAsyncApi(),
			`docs-site/static/mqtt-asyncapi.json is stale: ${REGENERATE}`,
		);
	});

	it('keeps MDX-significant characters inside code spans or encoded', () => {
		let inFence = false;
		for (const line of generator.generateMarkdown().split('\n')) {
			if (line.startsWith('```')) inFence = !inFence;
			if (inFence) continue;
			const outsideCode = line.split(/(`[^`]*`)/).filter((_, index) => index % 2 === 0).join('');
			assert.doesNotMatch(outsideCode, /[{}<>]/, `unescaped character in: ${line}`);
		}
	});
});

describe('D-Bus binding', () => {
	it('matches the exported INTERFACE, signatures included', () => {
		const { INTERFACE } = DBusControlService;
		assert.equal(INTERFACE.name, `${dbus.defaultBusName}.${dbus.interfaceSuffix}`);
		assert.equal(DBusControlService.DEFAULT_BUS_NAME, dbus.defaultBusName);
		assert.equal(DBusControlService.OBJECT_PATH, dbus.objectPath);
		assert.deepEqual(
			Object.entries(INTERFACE.methods),
			Object.entries(dbus.methods).map(([name, method]) => [name, [method.in, method.out]]),
		);
		assert.deepEqual(
			Object.entries(INTERFACE.signals),
			Object.entries(dbus.signals).map(([name, signal]) => [name, [signal.signature, ...signal.args]]),
		);
	});

	it('sends each single-field signal for the state field the contract says it carries', () => {
		for (const [field, signal] of DBusControlService.STATE_SIGNALS) {
			assert.deepEqual(dbus.signals[signal].state, [field], signal);
		}
	});

	it('maps every method to a TeamsControlService method', () => {
		for (const [name, method] of Object.entries(dbus.methods)) {
			assert.equal(typeof TeamsControlService.prototype[method.command], 'function', name);
			assert.ok(shared.commands[method.command], name);
		}
	});

	it('dispatches every method to the command the contract names', () => {
		const calls = [];
		const control = new EventEmitter();
		control.getState = () => ({ presenceStatus: 'busy' });
		for (const command of new Set(Object.values(dbus.methods).map((method) => method.command))) {
			if (command !== 'getState') control[command] = (...args) => { calls.push([command, ...args]); return true; };
		}
		let implementation;
		const bus = {
			connection: new EventEmitter(),
			requestName: (_name, _flags, callback) => callback(null, 1),
			exportInterface: (exported) => { implementation = exported; },
		};
		const logger = { info() {}, warn() {} };
		const service = new DBusControlService(control, { dbus: { sessionBus: () => bus }, platform: 'linux', env: {}, logger });
		service.start();
		try {
			for (const [name, method] of Object.entries(dbus.methods)) {
				calls.length = 0;
				const args = [...method.in].map((type) => (type === 'b' ? true : 'busy'));
				const result = implementation[name](...args);
				if (method.command === 'getState') {
					assert.equal(result, JSON.stringify({ presenceStatus: 'busy' }), name);
				} else {
					assert.equal(result, true, name);
					assert.deepEqual(calls, [[method.command, ...args]], name);
				}
			}
		} finally {
			service.stop();
		}
	});
});

describe('MQTT binding', () => {
	it('accepts exactly the actions the contract lists', () => {
		const client = new MQTTClient({ mqtt: {} });
		assert.deepEqual(client.allowedActions, mqtt.actions.map(({ action }) => action));
	});

	it('resolves every shortcut action to the accelerator it always had', () => {
		const client = new MQTTClient({ mqtt: {} });
		assert.deepEqual(client.actionShortcutMap, {
			'toggle-mute': 'Ctrl+Shift+M',
			'mute': 'Ctrl+Shift+M',
			'unmute': 'Ctrl+Shift+M',
			'toggle-video': 'Ctrl+Shift+O',
			'toggle-hand-raise': 'Ctrl+Shift+K',
			'leave': 'Ctrl+Shift+H',
		});
		assert.deepEqual(client.nonShortcutActions, ['get-calendar']);
	});

	it('keeps the presence map it always had', () => {
		assert.deepEqual(new MQTTClient({ mqtt: {} }).statusMap, {
			'-1': 'unknown', '1': 'available', '2': 'busy', '3': 'do_not_disturb', '4': 'away', '5': 'be_right_back',
		});
	});

	it('names a config key that exists for every topic, or documents its derived default', () => {
		for (const topic of mqtt.topics) {
			if (topic.fixedSubtopic) continue;
			const resolved = generator.resolveOption(topic.option);
			assert.ok(resolved.exists || topic.derivedDefault, `${topic.id}: ${topic.option} is not in options.js`);
		}
		for (const key of [mqtt.topicPrefixOption, mqtt.commandTopicOption, mqtt.client.clientIdOption]) {
			assert.ok(generator.resolveOption(key).exists, key);
		}
	});

	it('resolves the subtopic defaults the contract documents', () => {
		const defaults = getMediaTopics({});
		for (const topic of mqtt.topics.filter((entry) => entry.option?.startsWith('mqtt.mediaTopics.'))) {
			const key = topic.option.split('.').pop();
			const declared = options.mqtt.default.mediaTopics[key];
			if (declared !== undefined) assert.equal(defaults[key], declared, key);
			assert.equal(generator.defaultSubtopic(topic), defaults[key], key);
		}
		assert.equal(generator.defaultSubtopic(mqtt.topics.find((topic) => topic.id === 'status')), options.mqtt.default.statusTopic);
	});

	it('derives only the incoming-call caller topic from the topic it follows', () => {
		assert.deepEqual(mqtt.topics.filter((topic) => topic.derivedDefault).map((topic) => topic.id), ['incomingCallCaller']);
	});

	it('follows a renamed incoming-call topic but not a renamed microphone topic, once the config defaults are merged', () => {
		const config = { mqtt: { mediaTopics: { microphone: 'mic', incomingCall: 'ring' } } };
		applyObjectDefaults(config, options);
		const topics = getMediaTopics(config.mqtt);
		assert.equal(topics.incomingCallCaller, 'ring/caller');
		assert.equal(topics.microphoneControl, 'microphone/control');
		assert.equal(topics.microphone, 'mic');
	});

	it('publishes every topic with the retain flag the contract declares', async () => {
		const published = [];
		const mqttClient = { publish: async (topic, payload, publishOptions) => { published.push({ topic, payload, publishOptions }); } };
		const config = { mqtt: { topicPrefix: 'teams', clientId: 'c', incomingCallCaller: { enabled: true } } };
		new MQTTMediaStatusService(mqttClient, config).initialize();
		try {
			appEmitter.emit('teams-incoming-call-started', { name: 'Ada' });
			appEmitter.emit('teams-call-connected');
			ipcEmitter.emit('camera-state-changed', {}, true);
			ipcEmitter.emit('microphone-state-changed', {}, 'muted');
			ipcEmitter.emit('screen-sharing-started');
			ipcEmitter.emit('meeting-started');
			appEmitter.emit('teams-call-connected');
			await new Promise((resolve) => setImmediate(resolve));
			const topics = getMediaTopics({});
			const seen = [];
			for (const topic of mqtt.topics.filter((entry) => entry.option?.startsWith('mqtt.mediaTopics.'))) {
				const matches = published.filter((entry) => entry.topic === `teams/${topics[topic.id]}`);
				assert.ok(matches.length > 0, `${topic.id} was not published`);
				for (const match of matches) assert.equal(match.publishOptions.retain, topic.retained, topic.id);
				seen.push(topic.id);
			}
			assert.equal(seen.length, 8);
			assert.deepEqual(Object.keys(JSON.parse(published.find((entry) => entry.topic === 'teams/incoming-call/caller').payload)).sort(),
				['clientId', 'name', 'timestamp']);
		} finally {
			appEmitter.removeAllListeners();
			ipcEmitter.removeAllListeners();
		}
	});
});

describe('TeamsControlService against the contract', () => {
	it('accepts exactly the presence names the contract lets you set', () => {
		const contents = { isDestroyed: () => false, executeJavaScript: () => Promise.resolve(true) };
		const control = new TeamsControlService({ getShortcutWebContents: () => contents, performIncomingCallAction: () => true });
		const candidates = [...shared.presence.settable, ...shared.presence.observed.map(([, name]) => name), 'invisible', ''];
		for (const name of new Set(candidates)) {
			assert.equal(control.setStatus(name), shared.presence.settable.includes(name), name);
		}
	});
});

describe('AsyncAPI document', () => {
	const document = generator.generateAsyncApi();

	it('resolves every $ref', () => {
		const refs = [];
		const walk = (node) => {
			if (Array.isArray(node)) node.forEach(walk);
			else if (node && typeof node === 'object') {
				for (const [key, value] of Object.entries(node)) {
					if (key === '$ref') refs.push(value);
					else walk(value);
				}
			}
		};
		walk(document);
		assert.ok(refs.length > 0);
		for (const ref of refs) {
			assert.ok(ref.startsWith('#/'), ref);
			const target = ref.slice(2).split('/').reduce((node, segment) => node?.[segment], document);
			assert.ok(target !== undefined, `${ref} does not resolve`);
		}
	});

	it('carries every topic with its address and retain flag', () => {
		for (const topic of mqtt.topics) {
			const channel = document.channels[topic.id];
			assert.equal(channel.address, `{topicPrefix}/${generator.defaultSubtopic(topic)}`, topic.id);
			const operation = Object.values(document.operations).find((entry) => entry.channel.$ref === `#/channels/${topic.id}`);
			assert.equal(operation.action, 'send', topic.id);
			assert.equal(operation.bindings.mqtt.retain, topic.retained, topic.id);
			assert.equal(operation.bindings.mqtt.qos, mqtt.qos, topic.id);
			if (topic.option) assert.ok(channel.description.includes(topic.option), `${topic.id} names its option`);
		}
		assert.equal(document.channels.availability.address, `{topicPrefix}/${mqtt.availability.subtopic}`);
	});

	it('carries every command action in the command payload', () => {
		const actions = document.components.messages.command.payload.oneOf.map((schema) => schema.properties.action.const);
		assert.deepEqual(actions, mqtt.actions.map(({ action }) => action));
		assert.equal(document.operations.receiveCommand.action, 'receive');
	});

	it('publishes the shape of the calendar dates, and the documented forms satisfy it', () => {
		const calendar = document.components.messages.command.payload.oneOf.find((schema) => schema.title === 'get-calendar');
		for (const { name, pattern } of shared.commands.getCalendar.args) {
			const schema = calendar.properties[name];
			assert.equal(schema.pattern, pattern, name);
			// date-time would turn away the plain date the app accepts.
			assert.equal(schema.format, undefined, name);
			for (const documented of ['2025-11-27', '2025-11-27T10:00', '2026-01-05T00:00:00Z', '2025-11-27T10:00:00.123+01:00']) {
				assert.match(documented, new RegExp(pattern), `${name} ${documented}`);
			}
			assert.doesNotMatch('2025-11-27 10:00', new RegExp(pattern), name);
		}
	});
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const HomeAssistantDiscovery = require('../../app/mqtt/homeAssistantDiscovery');
const golden = require('./homeAssistantDiscovery.golden.json');

const { buildDiscoveryEntities } = HomeAssistantDiscovery;

// The golden file holds what the class published before the entity list was
// extracted into a pure function: three configs, topics and payloads in order.
describe('Home Assistant discovery entities', () => {
	for (const [name, { mqtt, published }] of Object.entries(golden)) {
		it(`lists exactly what was published before the refactor: ${name}`, () => {
			const entities = buildDiscoveryEntities(mqtt);
			assert.deepEqual(entities.map(({ topic, config }) => ({ topic, payload: config })),
				published.map(({ topic, payload }) => ({ topic, payload })));
		});

		it(`publishes that list with retain: ${name}`, async () => {
			const calls = [];
			const client = { isConnected: false, on() {}, publish: async (...args) => { calls.push(args); } };
			await new HomeAssistantDiscovery(client, { mqtt }).publishDiscovery();
			assert.deepEqual(calls, published.map(({ topic, payload, options }) => [topic, payload, options]));
		});
	}

	it('leaves the buttons out without a command topic', () => {
		const withoutCommand = golden.defaultsWithoutCommandTopic.mqtt;
		assert.deepEqual(buildDiscoveryEntities(withoutCommand).map(({ component }) => component).filter((c) => c === 'button'), []);
		assert.equal(buildDiscoveryEntities(golden.defaultsWithCommandTopic.mqtt).filter(({ component }) => component === 'button').length, 4);
	});
});

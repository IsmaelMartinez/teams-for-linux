'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { summarizeConfigForLog } = require('../../app/config/configLogSummary');
const realOptions = require('../../app/config/options');

const options = {
	trayIconEnabled: { default: true },
	defaultURLHandler: { default: '' },
	emptyOption: { default: '' },
	nothing: { default: null },
	mqtt: { default: { enabled: false, brokerUrl: '', username: '', topicPrefix: 'teams', reconnectPeriod: 1000 } },
	auth: { default: { basic: { user: '', hosts: [] }, clientCertificate: { password: '' } } },
	freeForm: { default: {} },
};

describe('summarizeConfigForLog', () => {
	it('keeps declared option names and booleans, and hides strings, numbers and arrays', () => {
		const summary = summarizeConfigForLog({
			trayIconEnabled: false,
			defaultURLHandler: '/usr/bin/firefox',
			emptyOption: '',
			mqtt: {
				enabled: true,
				brokerUrl: 'mqtts://broker.corp.example:8883?token=abc',
				username: 'alice',
				topicPrefix: 'teams/alice',
				reconnectPeriod: 5000,
			},
			auth: { basic: { user: String.raw`CORP\alice`, hosts: ['adfs.corp.example', 'sso.corp.example'] } },
			nothing: null,
		}, options);

		assert.deepStrictEqual(summary, {
			trayIconEnabled: false,
			defaultURLHandler: '[string]',
			emptyOption: '',
			mqtt: {
				enabled: true,
				brokerUrl: '[string]',
				username: '[string]',
				topicPrefix: '[string]',
				reconnectPeriod: '[number]',
			},
			auth: { basic: { user: '[string]', hosts: '[array of 2]' } },
			nothing: null,
		});
		const text = JSON.stringify(summary);
		for (const secret of ['corp.example', 'alice', 'firefox', 'token']) {
			assert.ok(!text.includes(secret), secret);
		}
	});

	it('hides a credential written as a number', () => {
		const summary = summarizeConfigForLog({ auth: { clientCertificate: { password: 123456 }, basic: { user: 4242 } } }, options);
		assert.deepStrictEqual(summary, { auth: { clientCertificate: { password: '[number]' }, basic: { user: '[number]' } } });
	});

	it('never prints a key the option definitions do not declare', () => {
		const summary = summarizeConfigForLog({
			auth: { basic: { user: { 'alice@corp.example': true } } },
			freeForm: { 'https://tenant.example/a': 1, 'bob@corp.example': 2 },
			'carol@corp.example': true,
		}, options);

		assert.deepStrictEqual(summary, {
			auth: { basic: { user: '[object]' } },
			freeForm: '[object]',
			'[other keys]': 1,
		});
		assert.ok(!JSON.stringify(summary).includes('corp.example'));
	});

	it('counts an undeclared key beside declared ones', () => {
		const summary = summarizeConfigForLog({ mqtt: { enabled: true, 'dave@corp.example': 'x' } }, options);
		assert.deepStrictEqual(summary, { mqtt: { enabled: true, '[other keys]': 1 } });
	});

	it('names settings that are declared only in an option\'s fields', () => {
		const withFields = {
			media: {
				default: { microphone: { disableAutogain: false, overrideConstraints: null } },
				fields: {
					'microphone.disableAutogain': { type: 'boolean' },
					'microphone.overrideConstraints.echoCancellation': { type: 'boolean' },
					'microphone.overrideConstraints.sampleRate': { type: 'number' },
				},
			},
		};
		const summary = summarizeConfigForLog({
			media: { microphone: { overrideConstraints: { echoCancellation: false, sampleRate: 48000, madeUp: 'x' } } },
		}, withFields);
		assert.deepStrictEqual(summary, {
			media: { microphone: { overrideConstraints: { echoCancellation: false, sampleRate: '[number]', '[other keys]': 1 } } },
		});
	});

	it('shows the real microphone constraint overrides', () => {
		const summary = summarizeConfigForLog({
			media: { microphone: { overrideConstraints: { echoCancellation: false, noiseSuppression: true } } },
		}, realOptions);
		assert.deepStrictEqual(summary, {
			media: { microphone: { overrideConstraints: { echoCancellation: false, noiseSuppression: true } } },
		});
	});

	it('names real options from the option definitions', () => {
		const summary = summarizeConfigForLog({ mqtt: { enabled: true, brokerUrl: 'mqtt://host' } }, realOptions);
		assert.deepStrictEqual(summary, { mqtt: { enabled: true, brokerUrl: '[string]' } });
	});

	it('passes through an empty or missing file', () => {
		assert.deepStrictEqual(summarizeConfigForLog({}, options), {});
		assert.strictEqual(summarizeConfigForLog(undefined, options), undefined);
	});
});

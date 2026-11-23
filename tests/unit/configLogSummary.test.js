'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { summarizeConfigForLog } = require('../../app/config/configLogSummary');

describe('summarizeConfigForLog', () => {
	it('hides a credential written as a number', () => {
		const summary = summarizeConfigForLog({ auth: { clientCertificate: { password: 123456 }, basic: { user: 4242 } } });
		assert.deepStrictEqual(summary, { auth: { clientCertificate: { password: '[number]' }, basic: { user: '[number]' } } });
		assert.ok(!JSON.stringify(summary).includes('123456'));
	});

	it('keeps option names and booleans, and hides strings, numbers and arrays', () => {
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
		});

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

	it('passes through an empty or missing file', () => {
		assert.deepStrictEqual(summarizeConfigForLog({}), {});
		assert.strictEqual(summarizeConfigForLog(undefined), undefined);
	});
});

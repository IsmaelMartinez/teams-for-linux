'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { toRendererConfig } = require('../../app/config/rendererConfig');

// GHSA-58j7-22f8-6xqp: page script in the Teams window can read whatever
// `get-config` returns, so credentials must never be in it.
describe('toRendererConfig', () => {
	const config = () => ({
		url: 'https://teams.cloud.microsoft',
		mqtt: { enabled: true, brokerUrl: 'mqtt://broker', username: 'u', password: 'mqtt-secret' },
		auth: {
			clientCertificate: { path: '/c.p12', password: 'cert-secret' },
			basic: { user: 'b', passwordCommand: 'pass show basic' },
			intune: { enabled: true, user: 'intune@example.com' },
			webLogin: { user: 'w', passwordCommand: 'pass show web' },
		},
		clientCertPassword: 'cert-secret',
		ssoBasicAuthPasswordCommand: 'pass show basic',
		documentPictureInPictureFrameName: 'teams-for-linux-document-pip-x',
	});

	it('removes every credential, nested and flat', () => {
		const text = JSON.stringify(toRendererConfig(config()));
		for (const secret of ['mqtt-secret', 'cert-secret', 'pass show basic', 'pass show web']) {
			assert.ok(!text.includes(secret), `${secret} leaked`);
		}
	});

	it('removes the account and broker details next to them', () => {
		const safe = toRendererConfig({ ...config(), ssoBasicAuthUser: 'b', clientCertPath: '/c.p12' });
		assert.strictEqual(safe.mqtt.username, undefined);
		assert.strictEqual(safe.mqtt.brokerUrl, undefined);
		assert.strictEqual(safe.auth.clientCertificate.path, undefined);
		assert.strictEqual(safe.auth.basic.user, undefined);
		assert.strictEqual(safe.auth.webLogin.user, undefined);
		assert.strictEqual(safe.auth.intune.user, undefined);
		assert.strictEqual(safe.auth.intune.enabled, true);
		assert.strictEqual(safe.ssoBasicAuthUser, undefined);
		assert.strictEqual(safe.clientCertPath, undefined);
	});

	it('keeps everything else, including the PiP frame name the preload needs', () => {
		const safe = toRendererConfig(config());
		assert.strictEqual(safe.url, 'https://teams.cloud.microsoft');
		assert.strictEqual(safe.mqtt.enabled, true);
		assert.strictEqual(safe.documentPictureInPictureFrameName, 'teams-for-linux-document-pip-x');
	});

	it('drops kebab-case aliases, environment keys and runtime-only keys', () => {
		const safe = toRendererConfig({
			...config(),
			'client-cert-password': 'cert-secret',
			'sso-basic-auth-password-command': 'pass show basic',
			githubToken: 'env-secret',
			appPath: '/opt/teams-for-linux',
		});
		const text = JSON.stringify(safe);
		for (const secret of ['cert-secret', 'pass show basic', 'env-secret']) {
			assert.ok(!text.includes(secret), `${secret} leaked`);
		}
		assert.strictEqual(safe.appPath, undefined);
	});

	it('drops the secrets from the config the real loader produces', () => {
		const yargs = require('yargs');
		const configOptions = require('../../app/config/options');
		process.env.T4L_TEST_ENV_SECRET = 'env-secret';
		try {
			const parsed = yargs()
				.env(true)
				.options(configOptions)
				.parse([
					'--clientCertPassword=cert-secret',
					'--mqtt.password=mqtt-secret',
					'--auth.client-certificate.password=cert-secret',
					'--auth.basic.password-command=pass show basic',
					'--mqtt.broker-url=mqtt://broker-secret',
				]);
			assert.strictEqual(parsed.t4lTestEnvSecret, 'env-secret', 'precondition: env vars become config keys');
			const text = JSON.stringify(toRendererConfig(parsed));
			assert.ok(parsed.auth['client-certificate'], 'precondition: dotted kebab flags keep a kebab copy');
			for (const secret of ['cert-secret', 'mqtt-secret', 'env-secret', 'pass show basic', 'broker-secret']) {
				assert.ok(!text.includes(secret), `${secret} leaked`);
			}
		} finally {
			delete process.env.T4L_TEST_ENV_SECRET;
		}
	});

	it('leaves the main-process config untouched', () => {
		const original = config();
		toRendererConfig(original);
		assert.strictEqual(original.mqtt.password, 'mqtt-secret');
		assert.strictEqual(original.clientCertPassword, 'cert-secret');
	});

	it('copes with missing groups', () => {
		assert.deepStrictEqual(toRendererConfig({ url: 'x' }), { url: 'x' });
		assert.deepStrictEqual(toRendererConfig({}), {});
		assert.deepStrictEqual(toRendererConfig({ auth: null }), { auth: null });
	});
});

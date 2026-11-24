const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const MODULE_PATH = require.resolve('../../app/intune');
const DBUS_PATH = require.resolve('@homebridge/dbus-native');

// A broker that answers the calls `answers` names and never answers the rest,
// as dbus-native leaves a call with no reply (or one queued on a connection
// that never completes) pending forever.
function loadWithBroker(answers) {
	const calls = [];
	require.cache[DBUS_PATH] = {
		id: DBUS_PATH,
		filename: DBUS_PATH,
		loaded: true,
		exports: {
			sessionBus: () => ({
				invoke(message, callback) {
					calls.push(message.member);
					if (message.member in answers) callback(null, JSON.stringify(answers[message.member]));
				},
			}),
		},
	};
	delete require.cache[MODULE_PATH];
	return { intune: require(MODULE_PATH), calls };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('intune broker calls give up on a broker that never answers', () => {
	beforeEach(() => {
		mock.timers.enable({ apis: ['setTimeout'] });
		mock.method(console, 'debug', () => {});
		mock.method(console, 'info', () => {});
		mock.method(console, 'warn', () => {});
	});

	afterEach(() => {
		mock.timers.reset();
		mock.restoreAll();
		delete require.cache[MODULE_PATH];
		delete require.cache[DBUS_PATH];
	});

	it('lets startup continue after one timed-out call, without retrying', { timeout: 5000 }, async () => {
		const { intune, calls } = loadWithBroker({});
		let done = false;
		const init = intune.initSso().then(() => { done = true; });
		await settle();
		mock.timers.tick(24999);
		await settle();
		assert.strictEqual(done, false);
		mock.timers.tick(1);
		await init;
		assert.deepStrictEqual(calls, ['getAccounts']);
		assert.strictEqual(intune.isSsoUrl('https://login.microsoftonline.com/common'), false);
	});

	it('releases a sign-in request whose cookie the broker never sends', { timeout: 5000 }, async () => {
		const account = { username: 'user@example.com' };
		const { intune } = loadWithBroker({ getAccounts: { accounts: [account] } });
		await intune.initSso();
		assert.strictEqual(intune.isSsoUrl('https://login.microsoftonline.com/common'), true);

		const headers = { Accept: '*/*' };
		let released = null;
		intune.addSsoCookie(
			{ url: 'https://login.microsoftonline.com/common', requestHeaders: headers },
			(result) => { released = result; },
		);
		await settle();
		assert.strictEqual(released, null);
		mock.timers.tick(25000);
		await settle();
		assert.deepStrictEqual(released, { requestHeaders: { Accept: '*/*' } });
	});
});

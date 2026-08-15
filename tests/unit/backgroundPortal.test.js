const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const MODULE_PATH = require.resolve('../../app/backgroundPortal');
const DBUS_PATH = require.resolve('@homebridge/dbus-native');

// The dbus module is required lazily inside init(), so planting a fake in
// require.cache before calling init() is enough to intercept the whole
// portal conversation.
function makeFakeBus({ portalVersion, responseCode }) {
	const connection = new EventEmitter();
	const calls = [];
	return {
		connection,
		calls,
		addMatch(rule, callback) {
			calls.push({ member: 'addMatch', rule });
			callback(null);
		},
		removeMatch(rule, callback) {
			calls.push({ member: 'removeMatch', rule });
			callback?.(null);
		},
		invoke(message, callback) {
			calls.push(message);
			if (message.member === 'Get') {
				// dbus-native marshals the variant as [signatureTree, [value]].
				callback(null, [[{ type: 'u' }], [portalVersion]]);
				return;
			}
			if (message.member === 'RequestBackground') {
				callback(null);
				const token = message.body[1].find(([key]) => key === 'handle_token')[1][1];
				setImmediate(() => {
					connection.emit('message', {
						interface: 'org.freedesktop.portal.Request',
						member: 'Response',
						path: `/org/freedesktop/portal/desktop/request/1_23/${token}`,
						body: [responseCode, []],
					});
				});
				return;
			}
			callback(null);
		},
	};
}

function loadWithFakeBus(fakeBus) {
	require.cache[DBUS_PATH] = {
		id: DBUS_PATH,
		filename: DBUS_PATH,
		loaded: true,
		exports: { sessionBus: () => fakeBus },
	};
	delete require.cache[MODULE_PATH];
	return require(MODULE_PATH);
}

async function waitFor(predicate) {
	for (let i = 0; i < 50; i++) {
		if (predicate()) return;
		await new Promise((resolve) => setImmediate(resolve));
	}
	throw new Error('condition not reached');
}

describe('backgroundPortal', () => {
	const originalFlatpakId = process.env.FLATPAK_ID;
	const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

	beforeEach(() => {
		delete require.cache[MODULE_PATH];
		delete require.cache[DBUS_PATH];
	});

	afterEach(() => {
		delete require.cache[MODULE_PATH];
		delete require.cache[DBUS_PATH];
		Object.defineProperty(process, 'platform', originalPlatform);
		if (originalFlatpakId === undefined) {
			delete process.env.FLATPAK_ID;
		} else {
			process.env.FLATPAK_ID = originalFlatpakId;
		}
	});

	function pretendFlatpakOnLinux() {
		Object.defineProperty(process, 'platform', {
			value: 'linux',
			configurable: true,
		});
		process.env.FLATPAK_ID = 'com.github.IsmaelMartinez.teams_for_linux';
	}

	it('does not initialise without FLATPAK_ID', () => {
		delete process.env.FLATPAK_ID;
		assert.strictEqual(require(MODULE_PATH).init(), false);
	});

	it('does not initialise outside linux even with FLATPAK_ID set', { skip: process.platform === 'linux' }, () => {
		process.env.FLATPAK_ID = 'com.github.IsmaelMartinez.teams_for_linux';
		assert.strictEqual(require(MODULE_PATH).init(), false);
	});

	it('requests background and sets status when granted on a v2 portal', async () => {
		pretendFlatpakOnLinux();
		const bus = makeFakeBus({ portalVersion: 2, responseCode: 0 });
		assert.strictEqual(loadWithFakeBus(bus).init(), true);

		await waitFor(() => bus.calls.some((c) => c.member === 'SetStatus'));

		const request = bus.calls.find((c) => c.member === 'RequestBackground');
		assert.strictEqual(request.signature, 'sa{sv}');
		const options = request.body[1];
		assert.ok(Array.isArray(options));
		assert.ok(options.some(([key]) => key === 'reason'));
		assert.ok(bus.calls.some((c) => c.member === 'removeMatch'));
	});

	it('skips SetStatus on a v1 portal even when granted', async () => {
		pretendFlatpakOnLinux();
		const bus = makeFakeBus({ portalVersion: 1, responseCode: 0 });
		assert.strictEqual(loadWithFakeBus(bus).init(), true);

		await waitFor(() => bus.calls.some((c) => c.member === 'removeMatch'));

		assert.ok(!bus.calls.some((c) => c.member === 'SetStatus'));
	});

	it('does not set status when the request is dismissed', async () => {
		pretendFlatpakOnLinux();
		const bus = makeFakeBus({ portalVersion: 2, responseCode: 1 });
		assert.strictEqual(loadWithFakeBus(bus).init(), true);

		await waitFor(() => bus.calls.some((c) => c.member === 'removeMatch'));

		assert.ok(!bus.calls.some((c) => c.member === 'SetStatus'));
	});
});

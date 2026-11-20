'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const electronPath = require.resolve('electron');
const loginPath = require.resolve('../../app/login');

let relaunches;
let login;

beforeEach(() => {
	relaunches = 0;
	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			app: { relaunch: () => { relaunches += 1; }, exit: () => {} },
			ipcMain: { on() {} },
			BrowserWindow: class {},
		},
	};
	delete require.cache[loginPath];
	login = require(loginPath);
});

afterEach(() => {
	delete require.cache[loginPath];
	delete require.cache[electronPath];
});

const server = (url, host) => [{ url }, { isProxy: false, host }];

describe('isExpectedChallenge', () => {
	it('always answers a proxy', () => {
		assert.strictEqual(login.isExpectedChallenge({ url: 'http://example.com/' }, { isProxy: true, host: 'proxy.corp.example' }, ['adfs.corp.example']), true);
	});

	it('never answers a server over cleartext HTTP or an unparseable URL', () => {
		assert.strictEqual(login.isExpectedChallenge(...server('http://adfs.corp.example/', 'adfs.corp.example')), false);
		assert.strictEqual(login.isExpectedChallenge(...server('http://adfs.corp.example/', 'adfs.corp.example'), ['adfs.corp.example']), false);
		assert.strictEqual(login.isExpectedChallenge({}, { host: 'adfs.corp.example' }), false);
		assert.strictEqual(login.isExpectedChallenge(undefined, undefined), false);
	});

	it('answers any HTTPS server while no hosts are configured', () => {
		assert.strictEqual(login.isExpectedChallenge(...server('https://anything.example/x', 'anything.example')), true);
	});

	it('answers only the configured hosts and their subdomains once the list is set', () => {
		const hosts = ['ADFS.corp.example', 'sso.example'];
		assert.strictEqual(login.isExpectedChallenge(...server('https://adfs.corp.example/adfs/ls', 'adfs.corp.example'), hosts), true);
		assert.strictEqual(login.isExpectedChallenge(...server('https://eu.sso.example/', 'EU.SSO.example'), hosts), true);
		assert.strictEqual(login.isExpectedChallenge(...server('https://other.example/x.png', 'other.example'), hosts), false);
		assert.strictEqual(login.isExpectedChallenge(...server('https://adfs.corp.example.evil.example/', 'adfs.corp.example.evil.example'), hosts), false);
		assert.strictEqual(login.isExpectedChallenge(...server('https://evilsso.example/', 'evilsso.example'), hosts), false);
	});
});

describe('normalizeHosts', () => {
	it('keeps an array, wraps a single string and drops anything unusable', () => {
		assert.deepStrictEqual(login.normalizeHosts(['adfs.corp.example', ' sso.example ']), ['adfs.corp.example', 'sso.example']);
		assert.deepStrictEqual(login.normalizeHosts('adfs.corp.example'), ['adfs.corp.example']);
		assert.deepStrictEqual(login.normalizeHosts(''), []);
		assert.deepStrictEqual(login.normalizeHosts(undefined), []);
		assert.deepStrictEqual(login.normalizeHosts(['', 42, null, 'adfs.corp.example']), ['adfs.corp.example']);
	});
});

describe('handleLoginDialogTry', () => {
	it('restricts the hosts when the option arrives as a single string, as from the command line', (t) => {
		t.mock.method(console, 'warn', () => {});
		t.mock.method(console, 'debug', () => {});
		const window = { webContents: new EventEmitter() };
		login.handleLoginDialogTry(window, 'alice', 'printf s3cr3t', 'adfs.corp.example');

		const refused = [];
		window.webContents.emit('login', { preventDefault() {} }, { url: 'https://other.example/x.png' }, { isProxy: false, host: 'other.example' }, (...args) => refused.push(args));
		assert.deepStrictEqual(refused, [[]]);

		const answered = [];
		window.webContents.emit('login', { preventDefault() {} }, { url: 'https://adfs.corp.example/' }, { isProxy: false, host: 'adfs.corp.example' }, (...args) => answered.push(args));
		assert.deepStrictEqual(answered, [['alice', 's3cr3t']]);
	});

	function fire(webContents, url, host) {
		const answers = [];
		let prevented = false;
		webContents.emit('login', { preventDefault: () => { prevented = true; } }, { url }, { isProxy: false, host }, (...args) => answers.push(args));
		return { answers, prevented };
	}

	it('cancels an unexpected challenge without spending the first try or relaunching', (t) => {
		t.mock.method(console, 'warn', () => {});
		t.mock.method(console, 'debug', () => {});
		const window = { webContents: new EventEmitter() };
		login.handleLoginDialogTry(window, 'alice', 'printf s3cr3t', ['adfs.corp.example']);

		for (const [url, host] of [['https://other.example/x.png', 'other.example'], ['http://adfs.corp.example/', 'adfs.corp.example']]) {
			const { answers, prevented } = fire(window.webContents, url, host);
			assert.strictEqual(prevented, true);
			assert.deepStrictEqual(answers, [[]]);
		}
		assert.strictEqual(relaunches, 0);

		// The expected host still gets the credential on its own first try.
		const { answers } = fire(window.webContents, 'https://adfs.corp.example/adfs/ls', 'adfs.corp.example');
		assert.deepStrictEqual(answers, [['alice', 's3cr3t']]);
		assert.strictEqual(relaunches, 0);
	});

	it('never logs the host of a refused challenge', (t) => {
		const warnings = [];
		t.mock.method(console, 'warn', (...args) => warnings.push(JSON.stringify(args)));
		const window = { webContents: new EventEmitter() };
		login.handleLoginDialogTry(window, 'alice', 'printf s3cr3t', ['adfs.corp.example']);
		fire(window.webContents, 'https://idp.contoso.example/', 'idp.contoso.example');
		assert.strictEqual(warnings.length, 1);
		assert.ok(!warnings[0].includes('contoso'), warnings[0]);
	});

	it('relaunches on a second challenge from an expected host, as before', (t) => {
		t.mock.method(console, 'debug', () => {});
		const window = { webContents: new EventEmitter() };
		login.handleLoginDialogTry(window, 'alice', 'printf s3cr3t');
		fire(window.webContents, 'https://adfs.corp.example/', 'adfs.corp.example');
		fire(window.webContents, 'https://adfs.corp.example/', 'adfs.corp.example');
		assert.strictEqual(relaunches, 1);
	});
});

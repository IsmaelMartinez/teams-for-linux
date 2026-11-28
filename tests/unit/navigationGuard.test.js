'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createNavigationGuard } = require('../../app/security/navigationGuard');
const { createTrustedPageCheck } = require('../../app/security/trustedPages');

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const TENANT_IDP = 'https://sso.corp.example';

function recordingLogger() {
	const lines = [];
	return {
		lines,
		info: (...args) => lines.push(['info', ...args]),
		warn: (...args) => lines.push(['warn', ...args]),
	};
}

function setup({ config = {}, configuredUrls = [] } = {}) {
	const logger = recordingLogger();
	const blocked = [];
	const isTrustedPage = createTrustedPageCheck(() => configuredUrls);
	const guard = createNavigationGuard({
		config,
		isTrustedPage,
		onBlocked: (origin) => blocked.push(origin),
		logger,
	});
	const webContents = new EventEmitter();
	guard.attach(webContents);
	// Electron 45 hands the listeners one details object.
	const navigate = (event, url, isMainFrame = true) => {
		const details = { url, isMainFrame, prevented: false, preventDefault() { this.prevented = true; } };
		webContents.emit(event, details);
		return details;
	};
	return { guard, logger, blocked, navigate, trusts: (url) => guard.isTrustedDestination(url) };
}

describe('navigation guard: the trust decision', () => {
	it('trusts Teams, an MCAS-proxied Teams host, Microsoft sign-in hosts and local app pages', () => {
		const { trusts } = setup();
		assert.strictEqual(trusts('https://teams.microsoft.com/v2/'), true);
		assert.strictEqual(trusts('https://teams.cloud.microsoft/'), true);
		assert.strictEqual(trusts('https://teams.microsoft.com.mcas.ms/v2/'), true);
		assert.strictEqual(trusts('https://login.microsoftonline.com/common/oauth2'), true);
		assert.strictEqual(trusts(pathToFileURL(path.join(APP_DIR, 'login', 'login.html')).href), true);
	});

	it('trusts the configured URL and profile URLs through the shared predicate', () => {
		const { trusts } = setup({ configuredUrls: ['https://configured.example/teams', 'https://profile.example/'] });
		assert.strictEqual(trusts('https://configured.example/other'), true);
		assert.strictEqual(trusts('https://profile.example/x'), true);
	});

	it('trusts about:blank and nothing else under about:', () => {
		const { trusts } = setup();
		assert.strictEqual(trusts('about:blank'), true);
		assert.strictEqual(trusts('about:srcdoc'), false);
	});

	it('refuses an unrelated https origin, http, a file outside the app, data: and the unparseable', () => {
		const { trusts } = setup();
		assert.strictEqual(trusts('https://unrelated.example/'), false);
		assert.strictEqual(trusts('http://teams.microsoft.com/'), false);
		assert.strictEqual(trusts('file:///etc/passwd'), false);
		assert.strictEqual(trusts('data:text/html,hello'), false);
		assert.strictEqual(trusts('javascript:alert(1)'), false);
		assert.strictEqual(trusts('not a url'), false);
		assert.strictEqual(trusts(''), false);
	});

	it('trusts an origin listed in urlHandling.navigationLock.extraOrigins, exact origin only', () => {
		const { trusts } = setup({ config: { urlHandling: { navigationLock: { extraOrigins: [TENANT_IDP] } } } });
		assert.strictEqual(trusts(`${TENANT_IDP}/adfs/ls?x=1`), true);
		assert.strictEqual(trusts('https://other.corp.example/'), false);
		assert.strictEqual(trusts('https://evil.sso.corp.example/'), false);
		assert.strictEqual(trusts('http://sso.corp.example/'), false);
		assert.strictEqual(trusts('https://sso.corp.example:8443/'), false);
	});

	it('ignores malformed extraOrigins entries (wildcard, path, http, credentials, non-string)', () => {
		const { trusts, logger } = setup({
			config: {
				urlHandling: {
					navigationLock: {
						extraOrigins: ['https://*.corp.example', 'https://sso.corp.example/path', 'http://sso.corp.example', 'https://u:p@sso.corp.example', 42, null],
					},
				},
			},
		});
		assert.strictEqual(trusts('https://sso.corp.example/'), false);
		assert.strictEqual(trusts('https://x.corp.example/'), false);
		// The count is logged, never the values.
		const logged = JSON.stringify(logger.lines);
		assert.ok(logged.includes('"rejected":6'), logged);
		assert.ok(!logged.includes('corp.example'), logged);
	});

	it('trusts an origin listed in auth.webauthn.extraOrigins', () => {
		const { trusts } = setup({ config: { auth: { webauthn: { extraOrigins: ['https://fido.corp.example'] } } } });
		assert.strictEqual(trusts('https://fido.corp.example/ceremony'), true);
	});

	it('trusts a host accepted by auth.webLogin.extraHosts, https only', () => {
		const { trusts } = setup({ config: { auth: { webLogin: { extraHosts: ['idp.corp.example'] } } } });
		assert.strictEqual(trusts('https://idp.corp.example/login'), true);
		assert.strictEqual(trusts('https://adfs.idp.corp.example/login'), true);
		assert.strictEqual(trusts('http://idp.corp.example/login'), false);
	});

	it('judges a blob: URL by its inner origin', () => {
		const { trusts } = setup({ config: { urlHandling: { navigationLock: { extraOrigins: [TENANT_IDP] } } } });
		assert.strictEqual(trusts('blob:https://teams.microsoft.com/3f2a'), true);
		assert.strictEqual(trusts(`blob:${TENANT_IDP}/3f2a`), true);
		assert.strictEqual(trusts('blob:https://unrelated.example/3f2a'), false);
		assert.strictEqual(trusts('blob:null/3f2a'), false);
		assert.strictEqual(trusts('blob:file:///etc/passwd'), false);
	});

	it('does not trust a lookalike of a trusted host', () => {
		const { trusts } = setup();
		assert.strictEqual(trusts('https://teams.microsoft.com.evil.example/'), false);
		assert.strictEqual(trusts('https://login.microsoftonline.com.evil.example/'), false);
	});

	it('refuses, rather than throws, when the shared predicate throws', () => {
		const guard = createNavigationGuard({
			config: {},
			isTrustedPage: () => { throw new Error('store unavailable'); },
			logger: recordingLogger(),
		});
		assert.strictEqual(guard.isTrustedDestination('https://unrelated.example/'), false);
	});
});

describe('navigation guard: observe mode (the default)', () => {
	it('never prevents a navigation, and logs a new untrusted origin once', () => {
		const { navigate, logger, blocked } = setup();

		const first = navigate('will-navigate', 'https://sso.corp.example/login?user=alice');
		const second = navigate('will-navigate', 'https://sso.corp.example/other');
		const redirect = navigate('will-redirect', 'https://sso.corp.example/again');

		assert.strictEqual(first.prevented, false);
		assert.strictEqual(second.prevented, false);
		assert.strictEqual(redirect.prevented, false);
		assert.deepStrictEqual(blocked, []);
		const info = logger.lines.filter(([level, message]) => level === 'info' && /left its trusted sites/.test(message));
		assert.strictEqual(info.length, 1);
		assert.deepStrictEqual(info[0][2], { scheme: 'https', kind: 'navigation' });
	});

	it('logs each new origin once, and says whether it was a redirect', () => {
		const { navigate, logger } = setup();
		navigate('will-navigate', 'https://a.example/');
		navigate('will-redirect', 'https://b.example/');
		const kinds = logger.lines.filter(([, m]) => /left its trusted sites/.test(m)).map((l) => l[2].kind);
		assert.deepStrictEqual(kinds, ['navigation', 'redirect']);
	});

	it('names the option in a hint once per session, not once per origin', () => {
		const { navigate, logger } = setup();
		navigate('will-navigate', 'https://a.example/');
		navigate('will-navigate', 'https://b.example/');
		navigate('will-navigate', 'https://c.example/');
		const hints = logger.lines.filter(([, m]) => m.includes('urlHandling.navigationLock.enabled'));
		assert.strictEqual(hints.length, 1);
	});

	it('does not log the origin, host, path or query', () => {
		const { navigate, logger } = setup();
		navigate('will-navigate', 'https://sso.corp.example/login?user=alice');
		const logged = JSON.stringify(logger.lines);
		assert.ok(!logged.includes('corp.example'), logged);
		assert.ok(!logged.includes('alice'), logged);
	});

	it('stays silent for a trusted destination', () => {
		const { navigate, logger } = setup();
		navigate('will-navigate', 'https://teams.microsoft.com/v2/');
		navigate('will-redirect', 'https://login.microsoftonline.com/x');
		assert.deepStrictEqual(logger.lines, []);
	});

	it('caps the origins it remembers, so the log and the set stay bounded', () => {
		const { navigate, logger } = setup();
		for (let i = 0; i < 200; i += 1) navigate('will-navigate', `https://site${i}.example/`);
		const noted = logger.lines.filter(([, m]) => /left its trusted sites/.test(m));
		assert.strictEqual(noted.length, 50);
	});
});

describe('navigation guard: enabled', () => {
	const enabled = { urlHandling: { navigationLock: { enabled: true } } };

	it('prevents an untrusted navigation and redirect and reports the origin', () => {
		const { navigate, blocked } = setup({ config: enabled });

		const nav = navigate('will-navigate', 'https://sso.corp.example/login?user=alice');
		const redirect = navigate('will-redirect', 'https://other.example/x');

		assert.strictEqual(nav.prevented, true);
		assert.strictEqual(redirect.prevented, true);
		assert.deepStrictEqual(blocked, ['https://sso.corp.example', 'https://other.example']);
	});

	it('reports the scheme for an origin that has no host', () => {
		const { navigate, blocked } = setup({ config: enabled });
		navigate('will-navigate', 'data:text/html,hello');
		assert.deepStrictEqual(blocked, ['data:']);
	});

	it('logs a warning without the origin, host, path or query', () => {
		const { navigate, logger } = setup({ config: enabled });
		navigate('will-navigate', 'https://sso.corp.example/login?user=alice');

		assert.strictEqual(logger.lines.filter(([level]) => level === 'warn').length, 1);
		const logged = JSON.stringify(logger.lines);
		assert.ok(!logged.includes('corp.example'), logged);
		assert.ok(!logged.includes('alice'), logged);
	});

	it('lets trusted destinations through untouched', () => {
		const { navigate, blocked } = setup({
			config: { urlHandling: { navigationLock: { enabled: true, extraOrigins: [TENANT_IDP] } } },
		});
		for (const url of ['https://teams.microsoft.com/', 'https://login.microsoftonline.com/', 'about:blank', `${TENANT_IDP}/adfs`]) {
			assert.strictEqual(navigate('will-navigate', url).prevented, false, url);
		}
		assert.deepStrictEqual(blocked, []);
	});

	it('survives an onBlocked callback that throws, and still prevents', () => {
		const logger = recordingLogger();
		const guard = createNavigationGuard({
			config: enabled,
			isTrustedPage: () => false,
			onBlocked: () => { throw new Error('dialog failed'); },
			logger,
		});
		const webContents = new EventEmitter();
		guard.attach(webContents);
		const details = { url: 'https://unrelated.example/', isMainFrame: true, preventDefault() { this.prevented = true; } };
		assert.doesNotThrow(() => webContents.emit('will-navigate', details));
		assert.strictEqual(details.prevented, true);
	});
});

describe('navigation guard: frames', () => {
	it('ignores sub-frame events in both modes', () => {
		for (const config of [{}, { urlHandling: { navigationLock: { enabled: true } } }]) {
			const { navigate, logger, blocked } = setup({ config });
			const details = navigate('will-navigate', 'https://unrelated.example/', false);
			navigate('will-redirect', 'https://unrelated.example/', false);
			assert.strictEqual(details.prevented, false);
			assert.deepStrictEqual(blocked, []);
			assert.deepStrictEqual(logger.lines, []);
		}
	});

	it('ignores an event without a details object or a string url', () => {
		const { logger } = setup();
		const webContents = new EventEmitter();
		createNavigationGuard({ config: {}, isTrustedPage: () => false, logger }).attach(webContents);
		assert.doesNotThrow(() => webContents.emit('will-navigate', undefined));
		assert.doesNotThrow(() => webContents.emit('will-navigate', { isMainFrame: true }));
	});
});

describe('trusted page check', () => {
	it('does not read the configured URLs for a Teams or sign-in page', () => {
		const check = createTrustedPageCheck(() => assert.fail('the profile list must not be read'));
		assert.strictEqual(check('https://teams.microsoft.com/v2/'), true);
		assert.strictEqual(check('https://teams.microsoft.com.mcas.ms/v2/'), true);
		assert.strictEqual(check('https://login.microsoftonline.com/x'), true);
		assert.strictEqual(check(pathToFileURL(path.join(APP_DIR, 'login', 'login.html')).href), true);
	});

	it('reads the configured URLs on each call for anything else, so profile changes apply', () => {
		let urls = [];
		const check = createTrustedPageCheck(() => urls);
		assert.strictEqual(check('https://profile.example/app'), false);
		urls = ['https://profile.example/other'];
		assert.strictEqual(check('https://profile.example/app'), true);
	});

	it('refuses http, about:blank, a file outside the app and an unrelated origin', () => {
		const check = createTrustedPageCheck(() => ['https://configured.example']);
		assert.strictEqual(check('https://unrelated.example/'), false);
		assert.strictEqual(check('http://unrelated.example/'), false);
		assert.strictEqual(check('about:blank'), false);
		assert.strictEqual(check('file:///etc/passwd'), false);
	});
});

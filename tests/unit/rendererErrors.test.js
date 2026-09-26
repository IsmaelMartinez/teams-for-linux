'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isPreLoginAuthNoise, parseChunkLoadFailure, formatChunkLoadWarning } = require('../../app/utils/rendererErrors');

describe('isPreLoginAuthNoise', () => {
	it('still matches the existing pre-login auth signatures', () => {
		for (const message of [
			'login_required: silent token acquisition failed',
			'AADSTS50058: A silent sign-in request was sent but no user is signed in.',
			'InteractionRequired: acquireTokenV2 needs user interaction',
			'AuthFailed',
		]) {
			assert.strictEqual(isPreLoginAuthNoise(message), true, message);
		}
	});

	// Teams logs this on every healthy startup, before identity has loaded.
	it("matches Teams' [_getUserIdentifier] user missing signature in any case", () => {
		assert.strictEqual(isPreLoginAuthNoise('[_getUserIdentifier] user missing. fn:getuid;user:0'), true);
		assert.strictEqual(isPreLoginAuthNoise('[_GETUSERIDENTIFIER] USER MISSING'), true);
	});

	it('leaves other "user missing" errors at error level', () => {
		assert.strictEqual(isPreLoginAuthNoise('user missing required license'), false);
	});

	it('leaves "User is not authenticated" at error level', () => {
		assert.strictEqual(isPreLoginAuthNoise('User is not authenticated'), false);
	});

	it('returns false for non-strings', () => {
		for (const value of [undefined, null, 42, { message: 'login_required' }]) {
			assert.strictEqual(isPreLoginAuthNoise(value), false);
		}
	});
});

describe('parseChunkLoadFailure', () => {
	it('parses the timeout Teams produces on a slow link', () => {
		const message = 'Loading chunk 489880 failed.\n(timeout: https://teams.public.onecdn.static.microsoft/teams-modular-packages/hashed-assets/489880-b5b9b897273172c2.js)';
		assert.deepStrictEqual(parseChunkLoadFailure(message), {
			reason: 'timeout',
			file: '489880-b5b9b897273172c2.js',
		});
	});

	it('keeps the reason webpack reports', () => {
		const message = 'Loading chunk 12 failed.\n(error: https://cdn.example/assets/12-abc.js)';
		assert.deepStrictEqual(parseChunkLoadFailure(message), { reason: 'error', file: '12-abc.js' });
	});

	it('drops the query string and fragment from the file name', () => {
		assert.deepStrictEqual(
			parseChunkLoadFailure('Loading chunk 7 failed.\n(missing: https://cdn.example/assets/7-def.js?v=2&sig=abc)'),
			{ reason: 'missing', file: '7-def.js' },
		);
		assert.deepStrictEqual(
			parseChunkLoadFailure('Loading chunk 8 failed.\n(timeout: https://cdn.example/assets/8-fed.js#frag)'),
			{ reason: 'timeout', file: '8-fed.js' },
		);
	});

	it('parses the CSS form, which carries no reason', () => {
		const message = 'Loading CSS chunk 3021 failed.\n(https://cdn.example/css/3021-aa.css)';
		assert.deepStrictEqual(parseChunkLoadFailure(message), { reason: 'error', file: '3021-aa.css' });
	});

	it('finds the failure inside a prefixed window-error message', () => {
		const message = 'Uncaught ChunkLoadError: Loading chunk 5 failed.\n(timeout: https://cdn.example/5-a1.js)';
		assert.deepStrictEqual(parseChunkLoadFailure(message), { reason: 'timeout', file: '5-a1.js' });
	});

	it("matches webpack's lowercase css form", () => {
		assert.deepStrictEqual(
			parseChunkLoadFailure('Loading css chunk 44 failed.\n(https://cdn.example/css/44-b.css)'),
			{ reason: 'error', file: '44-b.css' },
		);
	});

	// The file name ends up in a plain-text log line, so a renderer-supplied URL
	// carrying terminal escapes or bidi overrides must not match.
	it('rejects control and format characters in the URL', () => {
		for (const bad of ['a\x1b[2J\x1b[31mFAKE.js', 'a\x07.js', 'a\u0085.js', 'a\u202egpj.js']) {
			assert.strictEqual(parseChunkLoadFailure(`Loading chunk 1 failed.\n(timeout: https://cdn.example/${bad})`), null, JSON.stringify(bad));
		}
	});

	it('returns null for anything else', () => {
		for (const value of ['TypeError: Cannot read properties of undefined', undefined, null, 42]) {
			assert.strictEqual(parseChunkLoadFailure(value), null);
		}
	});
});

describe('formatChunkLoadWarning', () => {
	it('names the file and hints at a slow connection for a timeout', () => {
		const line = formatChunkLoadWarning({ reason: 'timeout', file: '489880-b5b9b897273172c2.js' });
		assert.match(line, /^\[NETWORK\] Teams code chunk timed out: 489880-b5b9b897273172c2\.js\./);
		assert.match(line, /too slow/);
	});

	// The reason group is captured under /i, so a cased variant still gets the hint.
	it('treats a cased timeout reason as a timeout', () => {
		const line = formatChunkLoadWarning({ reason: 'Timeout', file: '12-abc.js' });
		assert.match(line, /^\[NETWORK\] Teams code chunk timed out: 12-abc\.js\./);
		assert.match(line, /too slow/);
	});

	it('reports other reasons without the slow-connection hint', () => {
		const line = formatChunkLoadWarning({ reason: 'error', file: '12-abc.js' });
		assert.strictEqual(line, '[NETWORK] Teams code chunk failed to load (error): 12-abc.js');
	});

	it('scrubs PII from the file name and never prints an empty one', () => {
		assert.match(formatChunkLoadWarning({ reason: 'error', file: 'jane.doe@contoso.com.js' }), /\[EMAIL\]$/);
		assert.match(formatChunkLoadWarning({ reason: 'error', file: '' }), /: unknown$/);
	});
});

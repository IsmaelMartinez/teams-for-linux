'use strict';

const assert = require('node:assert');
const { sanitize, containsPII, detectPIITypes, createSanitizer } = require('../../app/utils/logSanitizer');

let passed = 0;
let failed = 0;
const failures = [];

function test(description, fn) {
	try {
		fn();
		passed++;
		console.log(`  ✓ ${description}`);
	} catch (error) {
		failed++;
		failures.push({ description, error });
		console.log(`  ✗ ${description}`);
		console.log(`    ${error.message}`);
	}
}

function describe(groupName, fn) {
	console.log(`\n${groupName}`);
	fn();
}

function runExactTests(cases) {
	cases.forEach(([name, input, expected]) => {
		test(name, () => assert.strictEqual(sanitize(input), expected));
	});
}

function runContainsTests(cases) {
	cases.forEach(([name, input, shouldContain, shouldNotContain = []]) => {
		test(name, () => {
			const result = sanitize(input);
			shouldContain.forEach(s => assert.ok(result.includes(s), `Expected "${s}" in: ${result}`));
			shouldNotContain.forEach(s => assert.ok(!result.includes(s), `Should not contain "${s}": ${result}`));
		});
	});
}

console.log('logSanitizer Unit Tests\n' + '='.repeat(50));

describe('Email sanitization', () => {
	runExactTests([
		['simple email', 'User email: john.doe@example.com', 'User email: [EMAIL]'],
		['multiple emails', 'From: sender@example.com To: receiver@company.org', 'From: [EMAIL] To: [EMAIL]'],
		['subdomain email', 'Contact: admin@mail.subdomain.example.co.uk', 'Contact: [EMAIL]'],
		['plus addressing', 'Email: user+tag@gmail.com', 'Email: [EMAIL]'],
	]);
});

describe('UUID sanitization', () => {
	runExactTests([
		['truncates to 8 chars', 'User ID: 12345678-1234-1234-1234-123456789abc', 'User ID: 12345678...'],
		['uppercase UUIDs', 'Session: ABCDEFAB-1234-5678-90AB-CDEF12345678', 'Session: ABCDEFAB...'],
		['multiple UUIDs', 'User 11111111-2222-3333-4444-555555555555 joined 66666666-7777-8888-9999-aaaaaaaaaaaa', 'User 11111111... joined 66666666...'],
	]);
});

describe('Password sanitization', () => {
	runExactTests([
		['password=value', 'Config: password=secretpassword123', 'Config: password=[REDACTED]'],
		['password: value', 'password: mysecretpass', 'password=[REDACTED]'],
		['quoted password', 'password="super_secret"', 'password=[REDACTED]'],
	]);
});

describe('Bearer token sanitization', () => {
	runContainsTests([
		['Bearer tokens', 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', ['[TOKEN]']],
	]);
	runExactTests([
		['lowercase bearer', 'bearer abc123xyz', 'Bearer [TOKEN]'],
	]);
});

describe('IP address sanitization', () => {
	runExactTests([
		['IPv4 address', 'Connected from 192.168.1.100', 'Connected from [IP]'],
		['multiple IPs', 'Route: 10.0.0.1 -> 172.16.0.1 -> 8.8.8.8', 'Route: [IP] -> [IP] -> [IP]'],
	]);
	runContainsTests([
		['localhost IP', 'Listening on 127.0.0.1:3000', ['[IP]']],
	]);
});

describe('MQTT URL sanitization', () => {
	runContainsTests([
		['mqtt:// credentials', 'Connecting to mqtt://username:password@broker.example.com:1883', ['mqtt://[CREDENTIALS]@'], ['username', 'password']],
		['mqtts:// credentials', 'Connecting to mqtts://user:pass@secure-broker.com', ['mqtts://[CREDENTIALS]@']],
	]);
});

describe('URL query parameter sanitization', () => {
	runContainsTests([
		['redacts query params', 'Redirect to https://example.com/auth?token=abc123&session=xyz', ['?[PARAMS]'], ['token=']],
		['preserves path', 'URL: https://api.example.com/v1/users?api_key=secret', ['/v1/users', '?[PARAMS]']],
	]);
});

describe('Authorization header sanitization', () => {
	runExactTests([
		['authorization= format', 'authorization=Basic dXNlcjpwYXNz', 'Authorization: [REDACTED]'],
		['Authorization: format', 'Authorization: Basic dXNlcjpwYXNz', 'Authorization: [REDACTED]'],
	]);
});

describe('API key sanitization', () => {
	runContainsTests([
		['api_key= format', 'Request with api_key=sk_live_abc123xyz', ['api_key=[REDACTED]']],
		['x-api-key: format', 'Header x-api-key: secret123', ['api_key=[REDACTED]']],
	]);
});

describe('Access and refresh token sanitization', () => {
	runExactTests([
		['access_token', 'access_token=eyJhbGciOiJIUzI1NiJ9', 'access_token=[REDACTED]'],
		['refresh_token', 'refresh_token=rt_abc123xyz', 'refresh_token=[REDACTED]'],
	]);
});

describe('Client secret sanitization', () => {
	runContainsTests([
		['client_secret', 'OAuth config: client_secret=super_secret_value', ['client_secret=[REDACTED]']],
	]);
});

describe('Certificate fingerprint sanitization', () => {
	runContainsTests([
		['SHA1 fingerprint', 'Certificate sha1=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD', ['[FINGERPRINT]']],
		['fingerprint= format', 'fingerprint=aabbccdd11223344556677889900aabbccdd1122', ['[FINGERPRINT]']],
	]);
});

describe('User path sanitization', () => {
	runExactTests([
		['Linux home paths', 'Config at /home/johndoe/.config/teams', 'Config at /home/[USER]/.config/teams'],
		['macOS user paths', 'File: /Users/johnsmith/Documents/file.txt', 'File: /Users/[USER]/Documents/file.txt'],
		['Windows user paths', String.raw`Path: C:\Users\JohnDoe\AppData\Local`, String.raw`Path: C:\Users\[USER]\AppData\Local`],
	]);
});

describe('Non-string input handling', () => {
	test('null input', () => assert.strictEqual(sanitize(null), 'null'));
	test('undefined input', () => assert.strictEqual(sanitize(undefined), 'undefined'));
	test('number input', () => assert.strictEqual(sanitize(12345), '12345'));
	test('object with PII', () => {
		const result = sanitize({ email: 'user@example.com', id: 123 });
		assert.ok(result.includes('[EMAIL]'), `Expected email redacted: ${result}`);
	});
});

describe('containsPII function', () => {
	test('true for email', () => assert.strictEqual(containsPII('Contact: user@example.com'), true));
	test('true for IP', () => assert.strictEqual(containsPII('Server at 192.168.1.1'), true));
	test('false for clean message', () => assert.strictEqual(containsPII('Application started successfully'), false));
	test('false for status message', () => assert.strictEqual(containsPII('Status: connected, retry count: 3'), false));
});

describe('detectPIITypes function', () => {
	test('detects email', () => assert.ok(detectPIITypes('Email: test@example.com').includes('email')));
	test('detects multiple types', () => {
		const types = detectPIITypes('User test@example.com from 192.168.1.1');
		assert.ok(types.includes('email') && types.includes('ipAddress'));
	});
	test('empty for clean message', () => assert.strictEqual(detectPIITypes('Clean log message').length, 0));
});

describe('createSanitizer function', () => {
	test('custom patterns', () => {
		const custom = createSanitizer({ internalId: /INTERNAL-\d+/g }, { internalId: '[INTERNAL_ID]' });
		assert.strictEqual(custom('Processing INTERNAL-12345'), 'Processing [INTERNAL_ID]');
	});
	test('default and custom patterns', () => {
		const custom = createSanitizer({ customCode: /CODE-[A-Z]+/g }, { customCode: '[CODE]' });
		const result = custom('User test@example.com has CODE-ABC');
		assert.ok(result.includes('[EMAIL]') && result.includes('[CODE]'));
	});
});

describe('Edge cases', () => {
	test('multiple PII types', () => {
		const result = sanitize('User john@example.com (ID: 12345678-1234-1234-1234-123456789abc) from 10.0.0.1');
		assert.ok(result.includes('[EMAIL]') && result.includes('12345678...') && result.includes('[IP]'));
	});
	test('JSON-like messages', () => {
		const result = sanitize('{"user":"admin@company.com","password":"secret123","ip":"192.168.1.50"}');
		assert.ok(result.includes('[EMAIL]') && result.includes('[REDACTED]') && result.includes('[IP]'));
	});
	test('preserves non-PII', () => assert.strictEqual(sanitize('App version 2.7.2 started'), 'App version 2.7.2 started'));
	test('empty string', () => assert.strictEqual(sanitize(''), ''));
	test('long email', () => assert.ok(sanitize(`Long: ${'a'.repeat(50)}@${'b'.repeat(50)}.com`).includes('[EMAIL]')));
});

describe('Teams for Linux scenarios', () => {
	runContainsTests([
		['MQTT broker', 'Connecting to: mqtt://teams-user:mqttpass123@broker.home.local:1883', ['mqtt://[CREDENTIALS]@'], ['teams-user', 'mqttpass123']],
		['Graph API params', 'Graph API: https://graph.microsoft.com/v1.0/me?$select=mail&access_token=eyJ', ['?[PARAMS]']],
		['SSO credential', 'SSO for user@company.onmicrosoft.com with access_token=abc123', ['[EMAIL]', 'access_token=[REDACTED]']],
		['certificate', 'Verified: fingerprint=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD', ['[FINGERPRINT]']],
		['config path', 'Loading from /home/realusername/.config/teams-for-linux/config.json', ['/home/[USER]']],
	]);
});

console.log('\n' + '='.repeat(50));
console.log(`Test Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
	console.log('\nFailed tests:');
	failures.forEach(({ description, error }) => {
		console.log(`  - ${description}`);
		console.log(`    Error: ${error.message}`);
	});
	process.exit(1);
}
console.log('\nAll tests passed!');

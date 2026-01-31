'use strict';

/**
 * Unit tests for the logSanitizer module.
 *
 * Run with: npm run test:unit
 * Or directly: node tests/unit/logSanitizer.test.js
 */

const assert = require('node:assert');
const { sanitize, containsPII, detectPIITypes, createSanitizer } = require('../../app/utils/logSanitizer');

// Test tracking
let passed = 0;
let failed = 0;
const failures = [];

/**
 * Simple test runner function
 */
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

/**
 * Test group helper
 */
function describe(groupName, fn) {
	console.log(`\n${groupName}`);
	fn();
}

// ============================================
// Test Suite
// ============================================

console.log('logSanitizer Unit Tests\n' + '='.repeat(50));

// --------------------------------------------
// Email Sanitization Tests
// --------------------------------------------
describe('Email sanitization', () => {
	test('should redact simple email addresses', () => {
		const input = 'User email: john.doe@example.com';
		const result = sanitize(input);
		assert.strictEqual(result, 'User email: [EMAIL]');
	});

	test('should redact multiple email addresses', () => {
		const input = 'From: sender@example.com To: receiver@company.org';
		const result = sanitize(input);
		assert.strictEqual(result, 'From: [EMAIL] To: [EMAIL]');
	});

	test('should redact email with subdomains', () => {
		const input = 'Contact: admin@mail.subdomain.example.co.uk';
		const result = sanitize(input);
		assert.strictEqual(result, 'Contact: [EMAIL]');
	});

	test('should redact email with plus addressing', () => {
		const input = 'Email: user+tag@gmail.com';
		const result = sanitize(input);
		assert.strictEqual(result, 'Email: [EMAIL]');
	});
});

// --------------------------------------------
// UUID Sanitization Tests
// --------------------------------------------
describe('UUID sanitization', () => {
	test('should truncate UUIDs to first 8 chars', () => {
		const input = 'User ID: 12345678-1234-1234-1234-123456789abc';
		const result = sanitize(input);
		assert.strictEqual(result, 'User ID: 12345678...');
	});

	test('should handle uppercase UUIDs', () => {
		const input = 'Session: ABCDEFAB-1234-5678-90AB-CDEF12345678';
		const result = sanitize(input);
		assert.strictEqual(result, 'Session: ABCDEFAB...');
	});

	test('should handle multiple UUIDs', () => {
		const input = 'User 11111111-2222-3333-4444-555555555555 joined room 66666666-7777-8888-9999-aaaaaaaaaaaa';
		const result = sanitize(input);
		assert.strictEqual(result, 'User 11111111... joined room 66666666...');
	});
});

// --------------------------------------------
// Password Sanitization Tests
// --------------------------------------------
describe('Password sanitization', () => {
	test('should redact password=value format', () => {
		const input = 'Config: password=secretpassword123';
		const result = sanitize(input);
		assert.strictEqual(result, 'Config: password=[REDACTED]');
	});

	test('should redact password: value format', () => {
		const input = 'password: mysecretpass';
		const result = sanitize(input);
		assert.strictEqual(result, 'password=[REDACTED]');
	});

	test('should redact quoted password values', () => {
		const input = 'password="super_secret"';
		const result = sanitize(input);
		assert.strictEqual(result, 'password=[REDACTED]');
	});
});

// --------------------------------------------
// Bearer Token Sanitization Tests
// --------------------------------------------
describe('Bearer token sanitization', () => {
	test('should redact Bearer tokens', () => {
		const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
		const result = sanitize(input);
		assert.ok(result.includes('[TOKEN]'), `Expected [TOKEN] in result: ${result}`);
	});

	test('should handle lowercase bearer', () => {
		const input = 'bearer abc123xyz';
		const result = sanitize(input);
		assert.strictEqual(result, 'Bearer [TOKEN]');
	});
});

// --------------------------------------------
// IP Address Sanitization Tests
// --------------------------------------------
describe('IP address sanitization', () => {
	test('should redact IPv4 addresses', () => {
		const input = 'Connected from 192.168.1.100';
		const result = sanitize(input);
		assert.strictEqual(result, 'Connected from [IP]');
	});

	test('should redact multiple IP addresses', () => {
		const input = 'Route: 10.0.0.1 -> 172.16.0.1 -> 8.8.8.8';
		const result = sanitize(input);
		assert.strictEqual(result, 'Route: [IP] -> [IP] -> [IP]');
	});

	test('should redact localhost IP', () => {
		const input = 'Listening on 127.0.0.1:3000';
		const result = sanitize(input);
		assert.ok(result.includes('[IP]'), `Expected [IP] in result: ${result}`);
	});
});

// --------------------------------------------
// MQTT URL Sanitization Tests
// --------------------------------------------
describe('MQTT URL sanitization', () => {
	test('should redact credentials in mqtt:// URLs', () => {
		const input = 'Connecting to mqtt://username:password@broker.example.com:1883';
		const result = sanitize(input);
		assert.ok(result.includes('mqtt://[CREDENTIALS]@'), `Expected credentials redacted: ${result}`);
		assert.ok(!result.includes('username'), `Should not contain username: ${result}`);
		assert.ok(!result.includes('password'), `Should not contain password: ${result}`);
	});

	test('should redact credentials in mqtts:// URLs', () => {
		const input = 'Connecting to mqtts://user:pass@secure-broker.com';
		const result = sanitize(input);
		assert.ok(result.includes('mqtts://[CREDENTIALS]@'), `Expected credentials redacted: ${result}`);
	});
});

// --------------------------------------------
// URL Query Parameter Sanitization Tests
// --------------------------------------------
describe('URL query parameter sanitization', () => {
	test('should redact query parameters', () => {
		const input = 'Redirect to https://example.com/auth?token=abc123&session=xyz';
		const result = sanitize(input);
		assert.ok(result.includes('?[PARAMS]'), `Expected params redacted: ${result}`);
		assert.ok(!result.includes('token='), `Should not contain token: ${result}`);
	});

	test('should preserve URL path while redacting params', () => {
		const input = 'URL: https://api.example.com/v1/users?api_key=secret';
		const result = sanitize(input);
		assert.ok(result.includes('/v1/users'), `Should preserve path: ${result}`);
		assert.ok(result.includes('?[PARAMS]'), `Should redact params: ${result}`);
	});
});

// --------------------------------------------
// Authorization Header Sanitization Tests
// --------------------------------------------
describe('Authorization header sanitization', () => {
	test('should redact authorization= format', () => {
		const input = 'authorization=Basic dXNlcjpwYXNz';
		const result = sanitize(input);
		assert.strictEqual(result, 'Authorization: [REDACTED]');
	});

	test('should redact Authorization: format', () => {
		const input = 'Authorization: Basic dXNlcjpwYXNz';
		const result = sanitize(input);
		assert.strictEqual(result, 'Authorization: [REDACTED]');
	});
});

// --------------------------------------------
// API Key Sanitization Tests
// --------------------------------------------
describe('API key sanitization', () => {
	test('should redact api_key= format', () => {
		const input = 'Request with api_key=sk_live_abc123xyz';
		const result = sanitize(input);
		assert.ok(result.includes('api_key=[REDACTED]'), `Expected api_key redacted: ${result}`);
	});

	test('should redact x-api-key: format', () => {
		const input = 'Header x-api-key: secret123';
		const result = sanitize(input);
		assert.ok(result.includes('api_key=[REDACTED]'), `Expected x-api-key redacted: ${result}`);
	});
});

// --------------------------------------------
// Access/Refresh Token Sanitization Tests
// --------------------------------------------
describe('Access and refresh token sanitization', () => {
	test('should redact access_token', () => {
		const input = 'access_token=eyJhbGciOiJIUzI1NiJ9';
		const result = sanitize(input);
		assert.strictEqual(result, 'access_token=[REDACTED]');
	});

	test('should redact refresh_token', () => {
		const input = 'refresh_token=rt_abc123xyz';
		const result = sanitize(input);
		assert.strictEqual(result, 'refresh_token=[REDACTED]');
	});
});

// --------------------------------------------
// Client Secret Sanitization Tests
// --------------------------------------------
describe('Client secret sanitization', () => {
	test('should redact client_secret', () => {
		const input = 'OAuth config: client_secret=super_secret_value';
		const result = sanitize(input);
		assert.ok(result.includes('client_secret=[REDACTED]'), `Expected client_secret redacted: ${result}`);
	});
});

// --------------------------------------------
// Certificate Fingerprint Sanitization Tests
// --------------------------------------------
describe('Certificate fingerprint sanitization', () => {
	test('should redact SHA1 fingerprint', () => {
		const input = 'Certificate sha1=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD';
		const result = sanitize(input);
		assert.ok(result.includes('[FINGERPRINT]'), `Expected fingerprint redacted: ${result}`);
	});

	test('should redact fingerprint= format', () => {
		const input = 'fingerprint=aabbccdd11223344556677889900aabbccdd1122';
		const result = sanitize(input);
		assert.ok(result.includes('[FINGERPRINT]'), `Expected fingerprint redacted: ${result}`);
	});
});

// --------------------------------------------
// User Path Sanitization Tests
// --------------------------------------------
describe('User path sanitization', () => {
	test('should redact Linux home paths', () => {
		const input = 'Config at /home/johndoe/.config/teams';
		const result = sanitize(input);
		assert.strictEqual(result, 'Config at /home/[USER]/.config/teams');
	});

	test('should redact macOS user paths', () => {
		const input = 'File: /Users/johnsmith/Documents/file.txt';
		const result = sanitize(input);
		assert.strictEqual(result, 'File: /Users/[USER]/Documents/file.txt');
	});

	test('should redact Windows user paths', () => {
		const input = 'Path: C:\\Users\\JohnDoe\\AppData\\Local';
		const result = sanitize(input);
		assert.strictEqual(result, 'Path: C:\\Users\\[USER]\\AppData\\Local');
	});
});

// --------------------------------------------
// Non-string Input Tests
// --------------------------------------------
describe('Non-string input handling', () => {
	test('should handle null input', () => {
		const result = sanitize(null);
		assert.strictEqual(result, 'null');
	});

	test('should handle undefined input', () => {
		const result = sanitize(undefined);
		assert.strictEqual(result, 'undefined');
	});

	test('should stringify objects', () => {
		const input = { email: 'user@example.com', id: 123 };
		const result = sanitize(input);
		assert.ok(result.includes('[EMAIL]'), `Expected email redacted in object: ${result}`);
	});

	test('should handle numbers', () => {
		const result = sanitize(12345);
		assert.strictEqual(result, '12345');
	});
});

// --------------------------------------------
// containsPII Tests
// --------------------------------------------
describe('containsPII function', () => {
	test('should return true for messages with email', () => {
		assert.strictEqual(containsPII('Contact: user@example.com'), true);
	});

	test('should return true for messages with IP', () => {
		assert.strictEqual(containsPII('Server at 192.168.1.1'), true);
	});

	test('should return false for clean messages', () => {
		assert.strictEqual(containsPII('Application started successfully'), false);
	});

	test('should return false for status messages', () => {
		assert.strictEqual(containsPII('Status: connected, retry count: 3'), false);
	});
});

// --------------------------------------------
// detectPIITypes Tests
// --------------------------------------------
describe('detectPIITypes function', () => {
	test('should detect email pattern', () => {
		const types = detectPIITypes('Email: test@example.com');
		assert.ok(types.includes('email'), `Expected email in types: ${types}`);
	});

	test('should detect multiple patterns', () => {
		const types = detectPIITypes('User test@example.com from 192.168.1.1');
		assert.ok(types.includes('email'), `Expected email in types: ${types}`);
		assert.ok(types.includes('ipAddress'), `Expected ipAddress in types: ${types}`);
	});

	test('should return empty array for clean messages', () => {
		const types = detectPIITypes('Clean log message');
		assert.strictEqual(types.length, 0);
	});
});

// --------------------------------------------
// createSanitizer Tests
// --------------------------------------------
describe('createSanitizer function', () => {
	test('should create sanitizer with custom patterns', () => {
		const customSanitize = createSanitizer(
			{ internalId: /INTERNAL-\d+/g },
			{ internalId: '[INTERNAL_ID]' }
		);
		const result = customSanitize('Processing INTERNAL-12345');
		assert.strictEqual(result, 'Processing [INTERNAL_ID]');
	});

	test('should apply both default and custom patterns', () => {
		const customSanitize = createSanitizer(
			{ customCode: /CODE-[A-Z]+/g },
			{ customCode: '[CODE]' }
		);
		const result = customSanitize('User test@example.com has CODE-ABC');
		assert.ok(result.includes('[EMAIL]'), `Expected email redacted: ${result}`);
		assert.ok(result.includes('[CODE]'), `Expected code redacted: ${result}`);
	});
});

// --------------------------------------------
// Edge Cases and Complex Scenarios
// --------------------------------------------
describe('Edge cases and complex scenarios', () => {
	test('should handle multiple PII types in one message', () => {
		const input = 'User john@example.com (ID: 12345678-1234-1234-1234-123456789abc) connected from 10.0.0.1';
		const result = sanitize(input);
		assert.ok(result.includes('[EMAIL]'), `Expected email redacted: ${result}`);
		assert.ok(result.includes('12345678...'), `Expected UUID truncated: ${result}`);
		assert.ok(result.includes('[IP]'), `Expected IP redacted: ${result}`);
	});

	test('should handle JSON-like log messages', () => {
		const input = '{"user":"admin@company.com","password":"secret123","ip":"192.168.1.50"}';
		const result = sanitize(input);
		assert.ok(result.includes('[EMAIL]'), `Expected email redacted: ${result}`);
		assert.ok(result.includes('[REDACTED]'), `Expected password redacted: ${result}`);
		assert.ok(result.includes('[IP]'), `Expected IP redacted: ${result}`);
	});

	test('should preserve non-PII content', () => {
		const input = 'Application version 2.7.2 started with 8 plugins';
		const result = sanitize(input);
		assert.strictEqual(result, input);
	});

	test('should handle empty string', () => {
		const result = sanitize('');
		assert.strictEqual(result, '');
	});

	test('should handle very long messages', () => {
		const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
		const result = sanitize(`Long email: ${longEmail}`);
		assert.ok(result.includes('[EMAIL]'), `Expected email redacted: ${result}`);
	});
});

// --------------------------------------------
// Real-world Teams for Linux scenarios
// --------------------------------------------
describe('Teams for Linux specific scenarios', () => {
	test('should sanitize MQTT broker connection log', () => {
		const input = 'Connecting to broker: mqtt://teams-user:mqttpass123@broker.home.local:1883';
		const result = sanitize(input);
		assert.ok(!result.includes('teams-user'), `Should not contain username: ${result}`);
		assert.ok(!result.includes('mqttpass123'), `Should not contain password: ${result}`);
		assert.ok(result.includes('mqtt://[CREDENTIALS]@'), `Expected credentials redacted: ${result}`);
	});

	test('should sanitize Graph API error with query params', () => {
		const input = 'Graph API error: https://graph.microsoft.com/v1.0/me?$select=mail,displayName&access_token=eyJ...';
		const result = sanitize(input);
		assert.ok(result.includes('?[PARAMS]'), `Expected params redacted: ${result}`);
	});

	test('should sanitize SSO credential log', () => {
		const input = 'SSO credential added for user@company.onmicrosoft.com with access_token=abc123';
		const result = sanitize(input);
		assert.ok(result.includes('[EMAIL]'), `Expected email redacted: ${result}`);
		assert.ok(result.includes('access_token=[REDACTED]'), `Expected token redacted: ${result}`);
	});

	test('should sanitize certificate verification log', () => {
		const input = 'Certificate verified: fingerprint=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD, issuer=Company CA';
		const result = sanitize(input);
		assert.ok(result.includes('[FINGERPRINT]'), `Expected fingerprint redacted: ${result}`);
	});

	test('should sanitize user config path log', () => {
		const input = 'Loading config from /home/realusername/.config/teams-for-linux/config.json';
		const result = sanitize(input);
		assert.ok(result.includes('/home/[USER]'), `Expected username redacted: ${result}`);
	});
});

// ============================================
// Test Summary
// ============================================

console.log('\n' + '='.repeat(50));
console.log(`Test Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
	console.log('\nFailed tests:');
	failures.forEach(({ description, error }) => {
		console.log(`  - ${description}`);
		console.log(`    Error: ${error.message}`);
	});
	process.exit(1);
} else {
	console.log('\nAll tests passed!');
	process.exit(0);
}

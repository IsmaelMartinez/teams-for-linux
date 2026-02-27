'use strict';

const assert = require('node:assert');
const { sanitizeLogData } = require('../../app/utils/logSanitizer');

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

console.log('Logger Hook Integration Tests\n' + '='.repeat(50));

describe('String message sanitization', () => {
	test('sanitizes email in string message', () => {
		const result = sanitizeLogData(['User logged in: john@example.com']);
		assert.strictEqual(result[0], 'User logged in: [EMAIL]');
	});

	test('sanitizes multiple string arguments', () => {
		const result = sanitizeLogData(['Email:', 'user@test.com', 'from IP:', '192.168.1.1']);
		assert.strictEqual(result[0], 'Email:');
		assert.strictEqual(result[1], '[EMAIL]');
		assert.strictEqual(result[2], 'from IP:');
		assert.strictEqual(result[3], '[IP]');
	});

	test('preserves clean strings', () => {
		const result = sanitizeLogData(['Application started', 'Version 2.7.2']);
		assert.strictEqual(result[0], 'Application started');
		assert.strictEqual(result[1], 'Version 2.7.2');
	});
});

describe('Object message sanitization', () => {
	test('sanitizes PII in object properties', () => {
		const result = sanitizeLogData([{ email: 'user@example.com', status: 'active' }]);
		assert.strictEqual(result[0].email, '[EMAIL]');
		assert.strictEqual(result[0].status, 'active');
	});

	test('sanitizes nested object properties', () => {
		const result = sanitizeLogData([{
			user: { email: 'admin@company.com' },
			connection: { ip: '10.0.0.1' }
		}]);
		assert.strictEqual(result[0].user.email, '[EMAIL]');
		assert.strictEqual(result[0].connection.ip, '[IP]');
	});

	test('sanitizes UUID in objects', () => {
		const result = sanitizeLogData([{ userId: '12345678-1234-1234-1234-123456789abc' }]);
		assert.strictEqual(result[0].userId, '12345678...');
	});

	test('preserves non-PII object properties', () => {
		const result = sanitizeLogData([{ count: 42, status: 'connected', active: true }]);
		assert.strictEqual(result[0].count, 42);
		assert.strictEqual(result[0].status, 'connected');
		assert.strictEqual(result[0].active, true);
	});
});

describe('Mixed message types', () => {
	test('handles string and object mix', () => {
		const result = sanitizeLogData([
			'Connection established',
			{ broker: 'mqtt://user:pass@broker.local', status: 'ok' }
		]);
		assert.strictEqual(result[0], 'Connection established');
		assert.ok(result[1].broker.includes('[CREDENTIALS]@'));
		assert.strictEqual(result[1].status, 'ok');
	});

	test('handles numbers unchanged', () => {
		const result = sanitizeLogData(['Count:', 42, 'errors']);
		assert.strictEqual(result[0], 'Count:');
		assert.strictEqual(result[1], 42);
		assert.strictEqual(result[2], 'errors');
	});

	test('handles null and undefined', () => {
		const result = sanitizeLogData(['Value:', null, undefined]);
		assert.strictEqual(result[0], 'Value:');
		assert.strictEqual(result[1], null);
		assert.strictEqual(result[2], undefined);
	});

	test('handles boolean values', () => {
		const result = sanitizeLogData(['Connected:', true, 'Debug:', false]);
		assert.strictEqual(result[1], true);
		assert.strictEqual(result[3], false);
	});
});

describe('Teams for Linux realistic scenarios', () => {
	test('MQTT connection log', () => {
		const result = sanitizeLogData([
			'MQTT connecting to:',
			{ brokerUrl: 'mqtt://mqttuser:secretpass@home-mqtt.local:1883', clientId: 'teams-linux' }
		]);
		assert.ok(result[1].brokerUrl.includes('[CREDENTIALS]@'), `Expected credentials redacted: ${result[1].brokerUrl}`);
		assert.strictEqual(result[1].clientId, 'teams-linux');
	});

	test('Graph API error log', () => {
		const result = sanitizeLogData([
			'Graph API error:',
			{ url: 'https://graph.microsoft.com/v1.0/me?$select=mail&access_token=eyJhbGc', code: 401 }
		]);
		assert.ok(result[1].url.includes('?[PARAMS]'), `Expected params redacted: ${result[1].url}`);
		assert.strictEqual(result[1].code, 401);
	});

	test('SSO authentication log', () => {
		const result = sanitizeLogData([
			'SSO authentication for user:',
			'admin@company.onmicrosoft.com'
		]);
		assert.strictEqual(result[1], '[EMAIL]');
	});

	test('Certificate verification log', () => {
		const result = sanitizeLogData([{
			issuer: 'DigiCert',
			fingerprint: 'sha256=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD'
		}]);
		assert.ok(result[0].fingerprint.includes('[FINGERPRINT]'));
		assert.strictEqual(result[0].issuer, 'DigiCert');
	});

	test('Config file path log', () => {
		const result = sanitizeLogData([
			'Loading config from:',
			'/home/realusername/.config/teams-for-linux/config.json'
		]);
		assert.ok(result[1].includes('/home/[USER]'), `Expected username redacted: ${result[1]}`);
	});
});

describe('Error and edge cases', () => {
	test('handles circular reference gracefully', () => {
		const circular = { name: 'test', email: 'user@example.com' };
		circular.self = circular;
		const result = sanitizeLogData([circular]);
		// Circular reference should be replaced with placeholder
		assert.strictEqual(result[0].name, 'test');
		assert.strictEqual(result[0].email, '[EMAIL]');
		assert.strictEqual(result[0].self, '[Circular]');
	});

	test('handles array in message data', () => {
		const result = sanitizeLogData([
			'Users:',
			['user1@example.com', 'user2@example.com']
		]);
		assert.strictEqual(result[0], 'Users:');
		assert.ok(Array.isArray(result[1]));
		assert.strictEqual(result[1][0], '[EMAIL]');
		assert.strictEqual(result[1][1], '[EMAIL]');
	});

	test('handles empty array', () => {
		const result = sanitizeLogData([]);
		assert.strictEqual(result.length, 0);
	});

	test('handles Error objects with PII', () => {
		const error = new Error('Connection failed to user@server.com');
		const result = sanitizeLogData([error]);
		assert.ok(result[0] instanceof Error);
		assert.ok(result[0].message.includes('[EMAIL]'), `Expected email in error message to be sanitized: ${result[0].message}`);
	});

	test('handles Error objects with custom properties', () => {
		const error = new Error('API request failed');
		error.code = 'ECONNREFUSED';
		error.statusCode = 403;
		error.endpoint = 'https://api.example.com/users/test@example.com';
		error.metadata = { userId: 'user-123', email: 'admin@test.com' };

		const result = sanitizeLogData([error]);
		assert.ok(result[0] instanceof Error, 'Result should be an Error object');
		assert.strictEqual(result[0].code, 'ECONNREFUSED', 'Non-string properties should be preserved');
		assert.strictEqual(result[0].statusCode, 403, 'Numeric properties should be preserved');
		// URL paths with email get sanitized as [PATH], which is correct behavior
		assert.ok(result[0].endpoint && (result[0].endpoint.includes('[EMAIL]') || result[0].endpoint.includes('[PATH]')),
			`String properties with PII should be sanitized, got: ${result[0].endpoint}`);
		assert.ok(result[0].metadata?.email?.includes('[EMAIL]'),
			`Nested object properties should be sanitized, got: ${JSON.stringify(result[0].metadata)}`);
	});

	test('sanitizes PII in object keys', () => {
		const objWithPIIKeys = {
			'user@example.com': 'status-active',
			'192.168.1.1': 'connected'
		};
		const result = sanitizeLogData([objWithPIIKeys]);
		// Keys should be sanitized
		assert.ok('[EMAIL]' in result[0], `Expected email key to be sanitized: ${JSON.stringify(result[0])}`);
		assert.ok('[IP]' in result[0], `Expected IP key to be sanitized: ${JSON.stringify(result[0])}`);
		// Original PII keys should not exist
		assert.ok(!('user@example.com' in result[0]), 'Original email key should not exist');
		assert.ok(!('192.168.1.1' in result[0]), 'Original IP key should not exist');
	});
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

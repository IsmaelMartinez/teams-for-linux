'use strict';

/**
 * Log Sanitizer Utility
 *
 * Provides PII (Personally Identifiable Information) sanitization for log messages.
 * This module implements regex-based pattern matching to redact sensitive data
 * before it is written to logs.
 *
 * Usage:
 *   const { sanitize } = require('./utils/logSanitizer');
 *   console.info(sanitize(`Connected to ${brokerUrl}`));
 *
 * @module utils/logSanitizer
 */

/**
 * PII patterns for detecting and redacting sensitive information.
 * Each pattern maps to a replacement strategy.
 */
const PII_PATTERNS = {
	// Email addresses: user@example.com
	email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

	// UUIDs: 12345678-1234-1234-1234-123456789abc
	uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,

	// Password values in various formats: password=xxx, password: xxx, password="xxx"
	// Also handles JSON format: "password":"value" or "password": "value"
	password: /password["']?\s*[=:]\s*["']?[^"',}\s]+["']?/gi,

	// Bearer tokens: Bearer eyJhbGc...
	bearerToken: /bearer\s+[a-zA-Z0-9._-]+/gi,

	// IPv4 addresses: 192.168.1.1
	ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

	// MQTT URLs with credentials: mqtt://user:pass@host or mqtts://user:pass@host
	mqttUrl: /(mqtts?:\/\/)[^:]+:[^@]+@/gi,

	// URL query parameters (may contain tokens): ?param=value&token=xxx
	urlQueryParams: /\?[^"'\s]+/g,

	// Authorization headers: Authorization: Basic xxx (Bearer handled separately by bearerToken)
	// Matches non-Bearer authorization schemes
	authHeader: /authorization[=:]\s*['"]?(?:basic|digest|ntlm|negotiate|hoba|mutual|aws4-hmac-sha256)\b[^'"\n,;]*['"]?/gi,

	// API keys in various formats: api_key=xxx, apiKey: xxx, x-api-key: xxx
	apiKey: /(?:api[_-]?key|x-api-key)[=:]\s*['"]?[^'"\s]+['"]?/gi,

	// Access tokens: access_token=xxx, accessToken: xxx
	accessToken: /(?:access[_-]?token)[=:]\s*['"]?[^'"\s]+['"]?/gi,

	// Refresh tokens: refresh_token=xxx, refreshToken: xxx
	refreshToken: /(?:refresh[_-]?token)[=:]\s*['"]?[^'"\s]+['"]?/gi,

	// Client secrets: client_secret=xxx, clientSecret: xxx
	clientSecret: /(?:client[_-]?secret)[=:]\s*['"]?[^'"\s]+['"]?/gi,

	// Certificate fingerprints (SHA-1 or SHA-256): fingerprint with colons or without
	certFingerprint: /(?:fingerprint|sha1|sha256)[=:]\s*['"]?[a-fA-F0-9:]{40,}['"]?/gi,

	// Windows/Unix file paths that might contain usernames: /home/username, C:\Users\username
	userPath: /(?:\/home\/|\/Users\/|C:\\Users\\)[^\s/\\]+/gi,
};

/**
 * Sanitizes a string by replacing PII patterns with redacted placeholders.
 *
 * @param {string|object} message - The message to sanitize (string or object to be stringified)
 * @returns {string} The sanitized message with PII replaced by placeholders
 *
 * @example
 * sanitize('User email: john@example.com')
 * // Returns: 'User email: [EMAIL]'
 *
 * @example
 * sanitize('Connected to mqtt://user:pass@broker.example.com')
 * // Returns: 'Connected to mqtt://[CREDENTIALS]@broker.example.com'
 */
function sanitize(message) {
	// Handle non-string input
	if (message === null || message === undefined) {
		return String(message);
	}

	if (typeof message !== 'string') {
		try {
			message = JSON.stringify(message);
		} catch {
			message = String(message);
		}
	}

	let sanitized = message;

	// Apply each pattern with its corresponding replacement
	// Order matters: more specific patterns should be applied first

	// MQTT URLs - redact credentials but keep protocol and host visible
	sanitized = sanitized.replace(PII_PATTERNS.mqttUrl, '$1[CREDENTIALS]@');

	// Authentication-related values
	// Apply bearerToken before authHeader to preserve [TOKEN] identifier for Bearer tokens
	sanitized = sanitized.replace(PII_PATTERNS.bearerToken, 'Bearer [TOKEN]');
	sanitized = sanitized.replace(PII_PATTERNS.password, 'password=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.authHeader, 'Authorization: [REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.apiKey, 'api_key=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.accessToken, 'access_token=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.refreshToken, 'refresh_token=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.clientSecret, 'client_secret=[REDACTED]');

	// Certificate fingerprints
	sanitized = sanitized.replace(PII_PATTERNS.certFingerprint, (match) => {
		const prefix = match.split(/[=:]/)[0];
		return `${prefix}=[FINGERPRINT]`;
	});

	// Email addresses
	sanitized = sanitized.replace(PII_PATTERNS.email, '[EMAIL]');

	// UUIDs - keep first 8 chars for debugging correlation
	sanitized = sanitized.replace(PII_PATTERNS.uuid, (match) => `${match.slice(0, 8)}...`);

	// IP addresses
	sanitized = sanitized.replace(PII_PATTERNS.ipAddress, '[IP]');

	// URL query parameters (may contain tokens)
	sanitized = sanitized.replace(PII_PATTERNS.urlQueryParams, '?[PARAMS]');

	// User paths - redact username but keep path structure
	sanitized = sanitized.replace(PII_PATTERNS.userPath, (match) => {
		if (match.startsWith('/home/')) {
			return '/home/[USER]';
		} else if (match.startsWith('/Users/')) {
			return '/Users/[USER]';
		} else if (match.toLowerCase().startsWith('c:\\users\\')) {
			return 'C:\\Users\\[USER]';
		}
		return '[PATH]';
	});

	return sanitized;
}

/**
 * Creates a sanitizer function with custom additional patterns.
 *
 * @param {Object.<string, RegExp>} customPatterns - Additional patterns to apply
 * @param {Object.<string, string|Function>} customReplacements - Replacements for custom patterns
 * @returns {Function} A sanitize function that includes custom patterns
 *
 * @example
 * const customSanitize = createSanitizer(
 *   { internalId: /INTERNAL-\d+/g },
 *   { internalId: '[INTERNAL_ID]' }
 * );
 */
function createSanitizer(customPatterns = {}, customReplacements = {}) {
	return function customSanitize(message) {
		let sanitized = sanitize(message);

		for (const [name, pattern] of Object.entries(customPatterns)) {
			const replacement = customReplacements[name] || '[REDACTED]';
			if (typeof replacement === 'function') {
				sanitized = sanitized.replace(pattern, replacement);
			} else {
				sanitized = sanitized.replace(pattern, replacement);
			}
		}

		return sanitized;
	};
}

/**
 * Checks if a message contains any PII patterns.
 * Useful for validation and testing.
 *
 * @param {string} message - The message to check
 * @returns {boolean} True if the message contains PII patterns
 */
function containsPII(message) {
	if (typeof message !== 'string') {
		try {
			message = JSON.stringify(message);
		} catch {
			message = String(message);
		}
	}

	for (const pattern of Object.values(PII_PATTERNS)) {
		// Reset lastIndex for global patterns
		pattern.lastIndex = 0;
		if (pattern.test(message)) {
			return true;
		}
	}

	return false;
}

/**
 * Lists all PII pattern names that match in a message.
 * Useful for debugging and testing.
 *
 * @param {string} message - The message to check
 * @returns {string[]} Array of pattern names that matched
 */
function detectPIITypes(message) {
	if (typeof message !== 'string') {
		try {
			message = JSON.stringify(message);
		} catch {
			message = String(message);
		}
	}

	const matches = [];

	for (const [name, pattern] of Object.entries(PII_PATTERNS)) {
		// Reset lastIndex for global patterns
		pattern.lastIndex = 0;
		if (pattern.test(message)) {
			matches.push(name);
		}
	}

	return matches;
}

module.exports = {
	sanitize,
	createSanitizer,
	containsPII,
	detectPIITypes,
	PII_PATTERNS,
};

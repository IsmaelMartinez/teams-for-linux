'use strict';

const PII_PATTERNS = {
	email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
	password: /password["']?\s*[=:]\s*["']?[^"',}\s]+["']?/gi,
	bearerToken: /bearer\s+[a-zA-Z0-9._-]+/gi,
	ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
	mqttUrl: /(mqtts?:\/\/)[^:]+:[^@]+@/gi,
	urlQueryParams: /\?[^"'\s]+/g,
	authHeader: /authorization[=:]\s*['"]?(?:basic|digest|ntlm|negotiate|hoba|mutual|aws4-hmac-sha256)\b[^'"\n,;]*['"]?/gi,
	apiKey: /(?:api[_-]?key|x-api-key)[=:]\s*['"]?[^'"\s]+['"]?/gi,
	accessToken: /(?:access[_-]?token)[=:]\s*['"]?[^'"\s]+['"]?/gi,
	refreshToken: /(?:refresh[_-]?token)[=:]\s*['"]?[^'"\s]+['"]?/gi,
	clientSecret: /(?:client[_-]?secret)[=:]\s*['"]?[^'"\s]+['"]?/gi,
	certFingerprint: /(?:fingerprint|sha1|sha256)[=:]\s*['"]?[a-fA-F0-9:]{40,}['"]?/gi,
	userPath: /(?:\/home\/|\/Users\/|C:\\Users\\)[^\s/\\]+/gi,
};

function sanitize(message) {
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

	// Order matters: specific patterns before general ones
	sanitized = sanitized.replace(PII_PATTERNS.mqttUrl, '$1[CREDENTIALS]@');
	sanitized = sanitized.replace(PII_PATTERNS.bearerToken, 'Bearer [TOKEN]');
	sanitized = sanitized.replace(PII_PATTERNS.password, 'password=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.authHeader, 'Authorization: [REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.apiKey, 'api_key=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.accessToken, 'access_token=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.refreshToken, 'refresh_token=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.clientSecret, 'client_secret=[REDACTED]');
	sanitized = sanitized.replace(PII_PATTERNS.certFingerprint, (match) => {
		const prefix = match.split(/[=:]/)[0];
		return `${prefix}=[FINGERPRINT]`;
	});
	sanitized = sanitized.replace(PII_PATTERNS.email, '[EMAIL]');
	sanitized = sanitized.replace(PII_PATTERNS.uuid, (match) => `${match.slice(0, 8)}...`);
	sanitized = sanitized.replace(PII_PATTERNS.ipAddress, '[IP]');
	sanitized = sanitized.replace(PII_PATTERNS.urlQueryParams, '?[PARAMS]');
	sanitized = sanitized.replace(PII_PATTERNS.userPath, (match) => {
		if (match.startsWith('/home/')) return '/home/[USER]';
		if (match.startsWith('/Users/')) return '/Users/[USER]';
		if (match.toLowerCase().startsWith('c:\\users\\')) return 'C:\\Users\\[USER]';
		return '[PATH]';
	});

	return sanitized;
}

function createSanitizer(customPatterns = {}, customReplacements = {}) {
	return function customSanitize(message) {
		let sanitized = sanitize(message);
		for (const [name, pattern] of Object.entries(customPatterns)) {
			const replacement = customReplacements[name] || '[REDACTED]';
			sanitized = sanitized.replace(pattern, replacement);
		}
		return sanitized;
	};
}

function containsPII(message) {
	if (typeof message !== 'string') {
		try {
			message = JSON.stringify(message);
		} catch {
			message = String(message);
		}
	}

	for (const pattern of Object.values(PII_PATTERNS)) {
		pattern.lastIndex = 0;
		if (pattern.test(message)) return true;
	}
	return false;
}

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
		pattern.lastIndex = 0;
		if (pattern.test(message)) matches.push(name);
	}
	return matches;
}

/**
 * Recursively sanitizes string values within an object
 * Preserves object structure while removing PII from string properties
 * @param {*} obj - The object to sanitize
 * @param {WeakSet} seen - Internal parameter to track circular references
 * @returns {*} Sanitized object
 */
function sanitizeObject(obj, seen = new WeakSet()) {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	// Handle circular references
	if (seen.has(obj)) {
		return '[Circular]';
	}

	// Handle Error objects - preserve their structure
	if (obj instanceof Error) {
		const sanitizedError = new Error(sanitize(obj.message));
		sanitizedError.name = obj.name;
		if (obj.stack) {
			sanitizedError.stack = sanitize(obj.stack);
		}
		return sanitizedError;
	}

	seen.add(obj);

	// Handle arrays
	if (Array.isArray(obj)) {
		return obj.map((item) => {
			if (typeof item === 'string') {
				return sanitize(item);
			}
			if (typeof item === 'object' && item !== null) {
				return sanitizeObject(item, seen);
			}
			return item;
		});
	}

	// Handle plain objects
	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		// Sanitize both keys and values to prevent PII leakage in object keys
		const sanitizedKey = sanitize(key);
		if (typeof value === 'string') {
			result[sanitizedKey] = sanitize(value);
		} else if (typeof value === 'object' && value !== null) {
			result[sanitizedKey] = sanitizeObject(value, seen);
		} else {
			result[sanitizedKey] = value;
		}
	}
	return result;
}

/**
 * Sanitizes an array of log message data items
 * Used by electron-log hook and tests
 * @param {Array} messageData - Array of log arguments
 * @returns {Array} Sanitized array
 */
function sanitizeLogData(messageData) {
	return messageData.map((item) => {
		if (typeof item === 'string') {
			return sanitize(item);
		}
		if (typeof item === 'object' && item !== null) {
			return sanitizeObject(item);
		}
		return item;
	});
}

module.exports = {
	sanitize,
	sanitizeObject,
	sanitizeLogData,
	createSanitizer,
	containsPII,
	detectPIITypes,
	PII_PATTERNS,
};

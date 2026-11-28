'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const logger = require('electron-log');

const GraphApiClient = require('../../app/graphApi');

const BASE = 'https://graph.microsoft.com/v1.0';
const SECRET_DATES = 'startDateTime=2025-06-01T00%3A00%3A00Z&endDateTime=2025-06-08T00%3A00%3A00Z';

let logged;
const originals = {};
let realFetch;

beforeEach(() => {
	logged = [];
	for (const level of ['debug', 'info', 'warn', 'error']) {
		originals[level] = logger[level];
		logger[level] = (...args) => logged.push({ level, args });
	}
	realFetch = globalThis.fetch;
});

afterEach(() => {
	for (const [level, fn] of Object.entries(originals)) logger[level] = fn;
	globalThis.fetch = realFetch;
});

function enabledClient() {
	const client = new GraphApiClient({ graphApi: { enabled: true } });
	client.acquireToken = async () => ({ success: true, token: 'token' });
	logged.length = 0;
	return client;
}

const logText = () => JSON.stringify(logged);

function respond(status, body) {
	globalThis.fetch = async () => ({ ok: status < 400, status, text: async () => body });
}

describe('GraphApiClient logging', () => {
	it('logs the method and the path of a request, never its query string', async () => {
		respond(200, '{"value":[]}');
		const client = enabledClient();
		await client.makeRequest(`/me/calendar/calendarView?${SECRET_DATES}`);
		await client.makeRequest(`${BASE}/me/calendar/calendarView?$skiptoken=PAGING-TOKEN`);
		assert.ok(!logText().includes('?'));
		assert.ok(!logText().includes('2025-06'));
		assert.ok(!logText().includes('PAGING-TOKEN'));
		assert.ok(logged.some((l) => l.args[1]?.method === 'GET' && l.args[1]?.endpoint === '/v1.0/me/calendar/calendarView'));
	});

	it('never logs a response body or preview', async () => {
		respond(200, 'BODY-TEXT not json');
		const client = enabledClient();
		await client.makeRequest('/me');
		assert.ok(!logText().includes('BODY-TEXT'));
	});

	it('logs a failure as a status and Graph code, without its message', async () => {
		respond(403, JSON.stringify({ error: { code: 'ErrorAccessDenied', message: 'SECRET-MESSAGE for someone@example.com' } }));
		const client = enabledClient();
		await client.makeRequest('/me');
		const failure = logged.find((l) => l.level === 'warn');
		assert.deepStrictEqual(failure.args[1], { status: 403, code: 'ErrorAccessDenied' });
		assert.ok(!logText().includes('SECRET'));
	});

	it('logs a thrown error as a code only', async () => {
		globalThis.fetch = async () => { throw Object.assign(new Error(`failed ${BASE}/me?${SECRET_DATES}`), { code: 'ECONNRESET' }); };
		const client = enabledClient();
		await client.makeRequest('/me');
		assert.deepStrictEqual(logged.find((l) => l.level === 'error').args[1], { code: 'ECONNRESET' });
		assert.ok(!logText().includes('2025-06'));
	});

	it('logs no dates, options or subject from the calendar and mail helpers', async () => {
		respond(200, '{"value":[]}');
		const client = enabledClient();
		await client.getCalendarView('2025-06-01T00:00:00Z', '2025-06-08T00:00:00Z');
		await client.getCalendarEvents({ filter: "subject eq 'FILTER-TEXT'" });
		await client.getMailMessages({ search: 'SEARCH-TEXT' });
		await client.createCalendarEvent({ subject: 'EVENT-SUBJECT' });
		for (const text of ['2025-06', 'FILTER-TEXT', 'SEARCH-TEXT', 'EVENT-SUBJECT']) {
			assert.ok(!logText().includes(text), text);
		}
	});

	it('logs a failed send without Graph error text', async () => {
		respond(500, JSON.stringify({ error: { code: 'Failure', message: 'SECRET-MESSAGE' } }));
		const client = enabledClient();
		await client.sendChatMessage('19:abc@thread.v2', 'hello');
		assert.ok(!logText().includes('SECRET'));
	});
});

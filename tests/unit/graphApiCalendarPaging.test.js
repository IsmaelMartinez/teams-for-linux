'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const GraphApiClient = require('../../app/graphApi');

const BASE = 'https://graph.microsoft.com/v1.0';

function clientWithPages(responses) {
	const client = new GraphApiClient({ graphApi: { enabled: true } });
	const calls = [];
	client.makeRequest = async (endpoint) => {
		calls.push(endpoint);
		return responses[calls.length - 1];
	};
	return { client, calls };
}

const page = (ids, nextLink) => ({
	success: true,
	data: { '@odata.context': 'ctx', value: ids.map((id) => ({ id })), ...(nextLink && { '@odata.nextLink': nextLink }) }
});

describe('GraphApiClient.getCalendarView paging', () => {
	it('follows nextLink and merges all pages', async () => {
		const { client, calls } = clientWithPages([
			page([1, 2], `${BASE}/me/calendar/calendarView?$skiptoken=a`),
			page([3, 4], `${BASE}/me/calendar/calendarView?$skiptoken=b`),
			page([5])
		]);
		const result = await client.getCalendarView('2025-01-01T00:00:00Z', '2025-01-31T00:00:00Z');
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.data.value.map((e) => e.id), [1, 2, 3, 4, 5]);
		assert.strictEqual(result.data['@odata.nextLink'], undefined);
		assert.strictEqual(calls.length, 3);
		assert.match(calls[1], /skiptoken=a/);
	});

	it('keeps the response shape for a single page', async () => {
		const { client } = clientWithPages([page([1])]);
		const result = await client.getCalendarView('s', 'e');
		assert.deepStrictEqual(result.data.value, [{ id: 1 }]);
	});

	it('surfaces a mid-way failure using the existing error shape', async () => {
		const failure = { success: false, error: 'boom', status: 500, data: null };
		const { client } = clientWithPages([page([1], `${BASE}/next`), failure]);
		assert.deepStrictEqual(await client.getCalendarView('s', 'e'), failure);
	});

	it('rejects a nextLink on another host without requesting it', async () => {
		const { client, calls } = clientWithPages([page([1], 'https://evil.example/steal'), page([2])]);
		const result = await client.getCalendarView('s', 'e');
		assert.strictEqual(result.success, false);
		assert.strictEqual(calls.length, 1);
	});

	it('stops at the page cap and returns what it has', async () => {
		const pages = Array.from({ length: 80 }, (_, i) => page([i], `${BASE}/next${i}`));
		const { client, calls } = clientWithPages(pages);
		const result = await client.getCalendarView('s', 'e');
		assert.strictEqual(result.success, true);
		assert.strictEqual(calls.length, 50);
		assert.strictEqual(result.data.value.length, 50);
	});
});

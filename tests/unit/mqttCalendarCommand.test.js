'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { createCalendarCommandHandler } = require('../../app/mqtt/calendarCommand');

let logs;
const originals = {};

beforeEach(() => {
	logs = [];
	for (const level of ['debug', 'info', 'warn', 'error']) {
		originals[level] = console[level];
		console[level] = (...args) => logs.push({ level, args });
	}
});

afterEach(() => {
	for (const [level, fn] of Object.entries(originals)) console[level] = fn;
});

function setup({ graph, config = { mqtt: { calendarExport: { enabled: true } } } } = {}) {
	const requests = [];
	const published = [];
	const graphApiClient = graph === undefined
		? { getCalendarView: async (...args) => { requests.push(args); return { success: true, data: { value: [] } }; } }
		: graph;
	const mqttClient = { publishToTopic: async (...args) => { published.push(args); } };
	const handle = createCalendarCommandHandler({ getGraphApiClient: () => graphApiClient, mqttClient, config });
	return { handle, requests, published };
}

describe('get-calendar input', () => {
	const accepted = [
		['an ISO date', '2025-11-27', '2025-11-28'],
		['a date-time without offset', '2025-11-27T10:00', '2025-11-27T11:00'],
		['a date-time with seconds', '2025-11-27T10:00:00', '2025-11-27T10:00:01'],
		['a date-time with a fraction and Z', '2025-11-27T10:00:00.123Z', '2025-11-27T10:00:00.456Z'],
		['a date-time with an offset', '2025-11-27T10:00+01:00', '2025-11-27T10:00:00-05:00'],
		['a range of 366 days', '2025-01-01', '2026-01-02'],
	];
	for (const [name, startDate, endDate] of accepted) {
		it(`accepts ${name}`, async () => {
			const { handle, requests, published } = setup();
			await handle({ startDate, endDate });
			assert.deepStrictEqual(requests, [[startDate, endDate]]);
			assert.strictEqual(published.length, 1);
		});
	}

	const refused = [
		['free text after a date', '2025-01-01 (free text)', '2025-01-02'],
		['free text in the end', '2025-01-01', '2025-01-02T00:00 trailing'],
		['a bare year', '2025', '2026'],
		['an array', ['2025-01-01'], '2025-01-02'],
		['a number', 1735689600000, '2025-01-02'],
		['an object', { toString: () => '2025-01-01' }, '2025-01-02'],
		['a missing end', '2025-01-01', undefined],
		['a missing start', undefined, '2025-01-02'],
		['an impossible month', '2025-13-01', '2025-14-01'],
		['a lowercase t separator', '2025-01-01t10:00', '2025-01-02'],
		['a start after the end', '2025-01-02', '2025-01-01'],
		['a start equal to the end', '2025-01-01', '2025-01-01'],
		['a range of 367 days', '2025-01-01', '2026-01-03'],
		['a huge range', '0001-01-01', '9999-12-31'],
	];
	for (const [name, startDate, endDate] of refused) {
		it(`refuses ${name} with one warning and no Graph call`, async () => {
			const { handle, requests, published } = setup();
			await handle({ startDate, endDate });
			assert.deepStrictEqual(requests, []);
			assert.deepStrictEqual(published, []);
			assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 1);
		});
	}

	it('refuses a command with no arguments', async () => {
		const { handle, requests } = setup();
		await handle();
		await handle({});
		assert.deepStrictEqual(requests, []);
	});
});

describe('get-calendar handling', () => {
	const dates = { startDate: '2025-06-01', endDate: '2025-06-08' };

	it('is refused when the option is off', async () => {
		const { handle, requests, published } = setup({ config: { mqtt: { calendarExport: { enabled: false } } } });
		await handle(dates);
		assert.deepStrictEqual(requests, []);
		assert.deepStrictEqual(published, []);
		assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 1);
	});

	it('is refused when the option is absent: calendar export is opt-in', async () => {
		const { handle, requests, published } = setup({ config: { mqtt: {} } });
		await handle(dates);
		assert.deepStrictEqual(requests, []);
		assert.deepStrictEqual(published, []);
	});

	it('is off in the default configuration', () => {
		const options = require('../../app/config/options');
		assert.strictEqual(options.mqtt.default.calendarExport.enabled, false);
	});

	it('is refused when there is no Graph client', async () => {
		const { handle, published } = setup({ graph: null });
		await handle(dates);
		assert.deepStrictEqual(published, []);
		assert.strictEqual(logs.filter((l) => l.level === 'warn').length, 1);
	});

	it('publishes the result to the calendar topic, not retained', async () => {
		const { handle, published } = setup();
		await handle(dates);
		assert.deepStrictEqual(published, [['calendar', { success: true, data: { value: [] } }, { retain: false }]]);
	});

	it('logs a Graph failure as a code only', async () => {
		const graph = {
			getCalendarView: async () => ({
				success: false, status: 403, error: 'SECRET-MESSAGE', data: { error: { code: 'ErrorAccessDenied', message: 'SECRET-MESSAGE' } },
			}),
		};
		const { handle, published } = setup({ graph });
		await handle(dates);
		assert.deepStrictEqual(published, []);
		const errors = logs.filter((l) => l.level === 'error');
		assert.strictEqual(errors.length, 1);
		assert.deepStrictEqual(errors[0].args[1], { code: 'ErrorAccessDenied' });
		assert.ok(!JSON.stringify(logs).includes('SECRET'));
	});

	it('falls back to the status when Graph gives no code', async () => {
		const graph = { getCalendarView: async () => ({ success: false, status: 500, error: 'SECRET-MESSAGE' }) };
		const { handle } = setup({ graph });
		await handle(dates);
		assert.deepStrictEqual(logs.find((l) => l.level === 'error').args[1], { code: 500 });
	});

	it('logs a thrown error as a code only', async () => {
		const graph = { getCalendarView: async () => { throw Object.assign(new Error('SECRET-MESSAGE 2025-06-01'), { code: 'ECONNRESET' }); } };
		const { handle } = setup({ graph });
		await handle(dates);
		assert.deepStrictEqual(logs.find((l) => l.level === 'error').args[1], { code: 'ECONNRESET' });
		assert.ok(!JSON.stringify(logs).includes('SECRET'));
	});

	it('logs none of the supplied values, accepted or refused', async () => {
		const marker = 'ZZ-MARKER';
		const { handle } = setup();
		await handle(dates);
		await handle({ startDate: `2025-06-01 ${marker}`, endDate: marker });
		await handle({ startDate: [marker], endDate: { marker } });
		const text = JSON.stringify(logs);
		assert.ok(!text.includes(marker));
		assert.ok(!text.includes('2025-06'));
		assert.ok(!text.includes('calendar'.concat('/')), 'no topic path');
	});
});

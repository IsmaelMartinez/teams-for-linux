'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { sanitizeCaller } = require('../../app/control/sanitizeCaller');

describe('sanitizeCaller', () => {
	it('keeps the declared fields of type string, number and boolean', () => {
		assert.deepStrictEqual(
			sanitizeCaller({ scenario: 's', number: 5, contact: false, name: 'Pat', callId: 'c', queue: 'q', image: 'x' }),
			{ scenario: 's', number: 5, contact: false, name: 'Pat', callId: 'c', queue: 'q' },
		);
	});

	it('drops objects, arrays, functions, null and undefined', () => {
		assert.deepStrictEqual(
			sanitizeCaller({ name: { a: 1 }, number: ['1'], queue: () => 'q', scenario: null, callId: undefined, contact: true }),
			{ contact: true },
		);
	});

	it('returns null when nothing is left or the input is not an object', () => {
		for (const input of [undefined, null, 'text', 5, ['name'], {}, { image: 'x' }, { name: {} }]) {
			assert.strictEqual(sanitizeCaller(input), null);
		}
	});
});

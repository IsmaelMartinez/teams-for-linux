'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const activityHub = require('../../app/browser/tools/activityHub');

describe('ActivityHub incoming-call classification', () => {
	it('treats a Teams-to-Teams call as ringing', () => {
		assert.strictEqual(activityHub.isIncomingCallScenario('incoming_call'), true);
	});

	it('treats a call from a phone number as ringing (#3019)', () => {
		assert.strictEqual(activityHub.isIncomingCallScenario('incoming_pstn_call'), true);
	});

	it('treats call-queue calls as ringing', () => {
		assert.strictEqual(activityHub.isIncomingCallScenario('incoming_call_queue_call'), true);
		assert.strictEqual(activityHub.isIncomingCallScenario('conference_incoming_call_queue_call'), true);
	});

	it('treats the toast dismissal and anything else as not ringing', () => {
		for (const name of [null, undefined, '', 'incoming_call_missed', 'outgoing_call']) {
			assert.strictEqual(activityHub.isIncomingCallScenario(name), false);
		}
	});
});

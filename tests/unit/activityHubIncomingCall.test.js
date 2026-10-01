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

// Shapes follow the toasts Teams sent for a direct phone call and for the two
// kinds of call-queue call (#3019), with the numbers and names replaced.
describe('ActivityHub incoming-call details', () => {
	it('gives the number and matched name of a direct phone call', () => {
		assert.deepStrictEqual(activityHub.getIncomingCallDetails({
			crossClientScenarioName: 'incoming_pstn_call',
			title: '+1 555-010-0001',
			text: 'Pat Example',
			callId: 'call-1',
			trustworthy: { trustReason: 'CONTACT', trustLevel: 'FAMILIAR' },
			mainImage: { src: 'data:image/jpeg;base64,AAAA' },
		}), {
			scenario: 'incoming_pstn_call',
			number: '+1 555-010-0001',
			name: 'Pat Example',
			contact: true,
			callId: 'call-1',
		});
	});

	it('gives the queue of a call-queue call', () => {
		assert.deepStrictEqual(activityHub.getIncomingCallDetails({
			crossClientScenarioName: 'incoming_call_queue_call',
			title: '+1 555-010-0001',
			text: 'Pat Example',
			headerTitle: 'Call for',
			headerSubtitle: 'Support Queue',
			callId: 'call-2',
			trustworthy: { trustReason: 'CONTACT' },
		}), {
			scenario: 'incoming_call_queue_call',
			number: '+1 555-010-0001',
			name: 'Pat Example',
			queue: 'Support Queue',
			contact: true,
			callId: 'call-2',
		});
	});

	it('leaves out a name that is only the number again', () => {
		// The first of the two conference-mode toasts, before Teams has
		// matched the caller: text repeats the number and trustworthy is null.
		assert.deepStrictEqual(activityHub.getIncomingCallDetails({
			crossClientScenarioName: 'conference_incoming_call_queue_call',
			title: '+1 555-010-0001',
			text: '+15550100001',
			headerTitle: 'Call for',
			headerSubtitle: 'Unknown user',
			callId: 'call-3',
			trustworthy: null,
		}), {
			scenario: 'conference_incoming_call_queue_call',
			number: '+1 555-010-0001',
			queue: 'Unknown user',
			callId: 'call-3',
		});
	});

	it('takes a title that is not a number as the name', () => {
		assert.deepStrictEqual(activityHub.getIncomingCallDetails({
			crossClientScenarioName: 'incoming_call',
			title: 'Pat Example',
		}), {
			scenario: 'incoming_call',
			name: 'Pat Example',
		});
	});

	it('gives nothing for a missing payload', () => {
		assert.deepStrictEqual(activityHub.getIncomingCallDetails(undefined), {});
	});
});

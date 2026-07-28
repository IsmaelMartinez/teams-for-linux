'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const activityHub = require('../../app/browser/tools/activityHub');

// Payload shapes below mirror real command-stream events captured during a
// live scheduled-meeting start on 2026-07-28 (#2587), with identifiers and
// names replaced by dummies. The structure is what matters: detection keys
// on intentLevel / toastType, never on the localized text.

const LIVE_MEETING_STATUS_BANNER = {
	intentLevel: 'LiveMeetingStatus',
	cause: 'LIVE_MEETING_STATUS_BAR_SINGLE_ACTIVE_MEETING',
	text: 'Meeting Started: Team Sync',
	actions: [
		{
			text: 'Join',
			command: {
				entity: { type: 'livemeetingstatusbar', action: 'join' },
				entityOptions: {
					callId: '00000000-0000-0000-0000-000000000001',
					threadId: '19:meeting_dummy@thread.v2',
					subject: 'Team Sync',
				},
			},
		},
	],
};

const MEETING_START_TOAST = {
	buttons: [
		{
			targetEntity: {
				action: 'mutate',
				dataOptions: {
					actionType: 'JoinMeetingFromToast',
					toastId: '00000000-0000-0000-0000-000000000002',
					toastType: 'MeetingStart',
				},
				type: 'calls',
			},
			text: 'Join',
		},
	],
};

describe('ActivityHub meeting-start classification', () => {
	it('detects the live-meeting status bar banner and returns its callId', () => {
		assert.strictEqual(
			activityHub.getMeetingStartId(LIVE_MEETING_STATUS_BANNER),
			'00000000-0000-0000-0000-000000000001'
		);
	});

	it('detects the LiveMeetingStatus banner even without a join action', () => {
		const banner = { intentLevel: 'LiveMeetingStatus', text: 'Meeting Started: X' };
		assert.strictEqual(activityHub.getMeetingStartId(banner), 'live-meeting-status');
	});

	it('detects the meeting-start toast and returns its toastId', () => {
		assert.strictEqual(
			activityHub.getMeetingStartId(MEETING_START_TOAST),
			'00000000-0000-0000-0000-000000000002'
		);
	});

	it('ignores non-meeting command payloads', () => {
		const nonMeeting = [
			null,
			undefined,
			{},
			{ reportDismissError: false },
			{ deleteKey: '1785244701802', discardDuringMeetingsAndCalls: true },
			{ intentLevel: 'Neutral', cause: 'PresenceDoNotDisturb', text: 'Your status is set to do not disturb.' },
			{ buttons: [{ targetEntity: { dataOptions: { toastType: 'Message' } } }] },
			{ buttons: [] },
		];
		for (const payload of nonMeeting) {
			assert.strictEqual(activityHub.getMeetingStartId(payload), null);
		}
	});
});

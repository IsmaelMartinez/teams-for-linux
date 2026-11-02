'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const activityHub = require('../../app/browser/tools/activityHub');
const ActivityManager = require('../../app/browser/notifications/activityManager');

// ADR-032: the incoming-call payload has no call identity, so only the main
// window forwards incoming-call events; call state is forwarded from every
// window. Registration happens through activityHub.on, so spy on that.
describe('ActivityManager window role', () => {
	let registered;
	let originalOn;

	beforeEach(() => {
		registered = [];
		originalOn = activityHub.on;
		activityHub.on = (event) => registered.push(event);
	});

	afterEach(() => {
		activityHub.on = originalOn;
	});

	it('forwards incoming calls and call state by default', () => {
		new ActivityManager({}, {}).registerActivityHandlers();
		assert.deepStrictEqual(registered, [
			'incoming-call-created',
			'incoming-call-ended',
			'call-connected',
			'call-disconnected',
		]);
	});

	it('forwards only call state when incoming calls are disabled', () => {
		new ActivityManager({}, {}, { forwardIncomingCalls: false }).registerActivityHandlers();
		assert.deepStrictEqual(registered, ['call-connected', 'call-disconnected']);
	});
});

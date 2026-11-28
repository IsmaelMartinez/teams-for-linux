'use strict';

const { errorCode } = require('./index');

const MAX_RANGE_DAYS = 366;
const MAX_RANGE_MS = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;

// An ISO 8601 date (2025-11-27) or date-time (2025-11-27T10:00, with optional
// seconds, fraction and Z or +hh:mm offset). Anchored, with no repeated group.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function toTime(value) {
	if (typeof value !== 'string' || !ISO_DATE.test(value)) return Number.NaN;
	return Date.parse(value);
}

/**
 * Handles the get-calendar command: asks Microsoft Graph for the events
 * between two dates and publishes them, not retained, to the calendar topic.
 *
 * The dates come from whoever can publish to the command topic, so nothing
 * they supplied is logged, only fixed text and error codes.
 *
 * @param {object} deps
 * @param {() => object|null} deps.getGraphApiClient - The Graph client, resolved
 *   per command because it is created after MQTT starts
 * @param {object} deps.mqttClient - The MQTTClient the calendar is published with
 * @param {object} deps.config - The app configuration
 * @returns {({ startDate, endDate }) => Promise<void>}
 */
function createCalendarCommandHandler({ getGraphApiClient, mqttClient, config }) {
	return async function handleGetCalendarCommand({ startDate, endDate } = {}) {
		console.info('[MQTT] get-calendar command received');

		if (config.mqtt?.calendarExport?.enabled === false) {
			console.warn('[MQTT] get-calendar refused: mqtt.calendarExport.enabled is off');
			return;
		}

		const start = toTime(startDate);
		const end = toTime(endDate);
		if (Number.isNaN(start) || Number.isNaN(end)) {
			console.warn('[MQTT] get-calendar refused: startDate and endDate must be ISO 8601 dates or date-times');
			return;
		}
		if (start >= end) {
			console.warn('[MQTT] get-calendar refused: startDate must be before endDate');
			return;
		}
		if (end - start > MAX_RANGE_MS) {
			console.warn(`[MQTT] get-calendar refused: the range is longer than ${MAX_RANGE_DAYS} days`);
			return;
		}

		const graphApiClient = getGraphApiClient();
		if (!graphApiClient) {
			console.warn('[MQTT] get-calendar refused: the Graph API client is not available');
			return;
		}

		try {
			const result = await graphApiClient.getCalendarView(startDate, endDate);

			if (result.success) {
				await mqttClient.publishToTopic('calendar', result, { retain: false });
				console.info('[MQTT] Calendar data published');
			} else {
				const graphCode = result.data?.error?.code;
				console.error('[MQTT] get-calendar failed:', { code: typeof graphCode === 'string' ? graphCode : (result.status ?? 'unknown') });
			}
		} catch (error) {
			console.error('[MQTT] get-calendar failed:', errorCode(error));
		}
	};
}

module.exports = { createCalendarCommandHandler };

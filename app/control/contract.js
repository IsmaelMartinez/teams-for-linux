'use strict';

/**
 * The automation contract: what Teams for Linux tells other programs and what
 * they may ask it to do, declared once.
 *
 * This is a pure data module (no `require`, no Electron) so that the code in
 * app/control, app/mqtt and app/dbus can read it at runtime and
 * scripts/generateControlDocs.js can load it in plain Node. Run
 * `npm run generate-control-docs` after editing it; a unit test fails when the
 * generated reference is stale.
 *
 * It has three parts:
 *   shared  the model both transports describe: presence, microphone states,
 *           caller fields, shortcuts, the observed `state` and the `commands`.
 *   mqtt    how MQTT carries that model (topics, payloads, command actions).
 *   dbus    how the Linux session D-Bus service carries it (methods, signals).
 *
 * Option names are given as dotted config paths. Defaults are not repeated
 * here: the generator resolves them from app/config/options.js and
 * app/mqtt/mediaTopics.js.
 */

const PRESENCE_OBSERVED = [
	[-1, 'unknown'], [1, 'available'], [2, 'busy'], [3, 'do_not_disturb'], [4, 'away'], [5, 'be_right_back'],
];
// `offline` can be requested but is never observed.
const PRESENCE_SETTABLE = ['available', 'busy', 'do_not_disturb', 'away', 'be_right_back', 'offline'];
const PRESENCE_NAMES = PRESENCE_OBSERVED.map(([, name]) => name);

const MICROPHONE_STATES = ['speaking', 'silent', 'muted', 'off', 'unknown'];
const MICROPHONE_CONTROL_STATES = ['muted', 'unmuted', 'off', 'unknown'];

// What the MQTT microphone topics can carry. The renderer only ever reports
// these four states (app/browser/tools/speakingIndicator.js), so `unknown`,
// which the D-Bus snapshot starts at, is never published there.
const MICROPHONE_PUBLISHED = MICROPHONE_STATES.filter((state) => state !== 'unknown');
const MICROPHONE_CONTROL_PUBLISHED = MICROPHONE_CONTROL_STATES.filter((state) => state !== 'unknown');

const CALLER_FIELDS = [
	{ name: 'scenario', type: 'string', description: 'Teams scenario name of the ringing call, for example a call queue.' },
	{ name: 'number', type: 'string', description: 'Caller phone number as Teams formats it, when the caller has one.' },
	{ name: 'name', type: 'string', description: 'Caller name, when Teams supplies one.' },
	{ name: 'queue', type: 'string', description: 'Name of the call queue, for call-queue calls.' },
	{ name: 'contact', type: 'boolean', description: 'Whether Teams trusts the caller as one of your contacts.' },
	{ name: 'callId', type: 'string', description: 'Teams call identifier.' },
];

const BOOLEAN_TEXT = { format: 'text', values: ['true', 'false'] };

const shared = {
	presence: { observed: PRESENCE_OBSERVED, settable: PRESENCE_SETTABLE },

	microphone: {
		states: MICROPHONE_STATES,
		controlStates: MICROPHONE_CONTROL_STATES,
		// Observed microphone state to control state; anything not listed maps to `controlFallback`.
		controlFor: { muted: 'muted', speaking: 'unmuted', silent: 'unmuted', off: 'off' },
		controlFallback: 'unknown',
	},

	caller: { fields: CALLER_FIELDS },
	participants: { maxEntries: 100, maxNameLength: 128 },

	shortcuts: {
		mute: 'Ctrl+Shift+M',
		video: 'Ctrl+Shift+O',
		handRaise: 'Ctrl+Shift+K',
		leave: 'Ctrl+Shift+H',
	},

	// One entry per observed field, in the order of the snapshot GetState returns.
	state: [
		{
			field: 'presenceStatus', type: 'string', values: PRESENCE_NAMES, gate: null, personalData: false,
			description: 'Your Teams presence as a stable name; unknown until Teams reports it.',
		},
		{
			field: 'presenceStatusCode', type: 'integer', gate: null, personalData: false,
			description: 'The numeric presence code Teams reported, an integer in the int32 range, -1 until Teams reports one. A code outside the known ones is kept, and the presence status for it is unknown.',
		},
		{
			field: 'inCall', type: 'boolean', gate: null, personalData: false,
			description: 'Whether a call is connected.',
		},
		{
			field: 'incomingCall', type: 'boolean', gate: null, personalData: false,
			description: 'Whether a call is ringing.',
		},
		{
			field: 'incomingCallCaller', type: 'object', nullable: true, gate: 'mqtt.incomingCallCaller.enabled', personalData: true,
			description: 'Who is calling while a call rings: scenario, number, name, queue, contact and callId, each present only when Teams supplies it. The option governs both transports.',
		},
		{
			field: 'cameraEnabled', type: 'boolean', gate: null, personalData: false,
			description: 'Whether your camera is on in the call.',
		},
		{
			field: 'microphoneState', type: 'string', values: MICROPHONE_STATES, gate: null, personalData: false,
			description: 'The microphone as observed: speaking or silent while unmuted, muted, off outside a call, unknown when not observed.',
		},
		{
			field: 'microphoneControlState', type: 'string', values: MICROPHONE_CONTROL_STATES, gate: null, personalData: false,
			description: 'The microphone reduced to what a mute toggle needs: muted, unmuted (speaking or silent), off or unknown.',
		},
		{
			field: 'screenSharing', type: 'boolean', gate: null, personalData: false,
			description: 'Whether you are sharing your screen.',
		},
		{
			field: 'meetingStarted', type: 'boolean', gate: 'mqtt.meetingStartDetection.enabled', personalData: false,
			description: 'A pulse that is true when a scheduled meeting is detected as started, and returns to false when you join or the reset delay passes.',
		},
		{
			field: 'callParticipants', type: 'array', nullable: true, gate: 'dbusControl.callParticipants', personalData: true,
			description: 'The remote participants on the call stage, each with a name and whether they are speaking; null outside a call. Experimental, read from Teams markup.',
		},
	],

	effects: {
		shortcut: 'Sends a keyboard shortcut to Teams',
		'incoming-call': 'Answers or declines a ringing call',
		presence: 'Changes your presence',
		'read-state': 'Returns observed state',
		calendar: 'Exports calendar events',
	},

	// Keyed by a neutral id that equals the TeamsControlService method name where one exists.
	commands: {
		toggleMute: {
			description: 'Toggle the microphone mute.', args: [], effect: 'shortcut', shortcut: 'mute',
		},
		mute: {
			description: 'Mute the microphone. Does nothing when it is already muted; when the observed state is neither muted nor unmuted it acts only with force.',
			args: [{ name: 'force', type: 'boolean', required: false, description: 'Act even when the microphone state is not observed.' }],
			effect: 'shortcut', shortcut: 'mute',
		},
		unmute: {
			description: 'Unmute the microphone. Does nothing when it is already unmuted; when the observed state is neither muted nor unmuted it acts only with force.',
			args: [{ name: 'force', type: 'boolean', required: false, description: 'Act even when the microphone state is not observed.' }],
			effect: 'shortcut', shortcut: 'mute',
		},
		toggleVideo: {
			description: 'Toggle the camera.', args: [], effect: 'shortcut', shortcut: 'video',
		},
		toggleHandRaise: {
			description: 'Raise or lower your hand.', args: [], effect: 'shortcut', shortcut: 'handRaise',
		},
		leaveCall: {
			description: 'Leave the current call.', args: [], effect: 'shortcut', shortcut: 'leave',
		},
		acceptAudio: {
			description: 'Answer the ringing call with audio only.', args: [], effect: 'incoming-call',
		},
		acceptVideo: {
			description: 'Answer the ringing call with video.', args: [], effect: 'incoming-call',
		},
		declineCall: {
			description: 'Decline the ringing call.', args: [], effect: 'incoming-call',
		},
		setStatus: {
			description: 'Set your Teams presence. offline can be set but is never observed.',
			args: [{ name: 'status', type: 'string', required: true, values: PRESENCE_SETTABLE, description: 'The presence to set.' }],
			effect: 'presence',
		},
		getState: {
			description: 'Return the observed state as one JSON object.', args: [], effect: 'read-state',
		},
		getCalendar: {
			description: 'Publish your calendar events between two dates. Needs the Graph API integration.',
			args: [
				{ name: 'startDate', type: 'string', required: true, format: 'date-time', description: 'Start of the range, ISO 8601.' },
				{ name: 'endDate', type: 'string', required: true, format: 'date-time', description: 'End of the range, ISO 8601.' },
			],
			effect: 'calendar',
		},
	},
};

const mqtt = {
	// Every publish uses this QoS; QoS 1 and 2 are not used.
	qos: 0,
	// Connection settings the app does not set itself: the MQTT library's defaults apply.
	client: { clientIdOption: 'mqtt.clientId', cleanSession: true, keepAliveSeconds: 60 },
	topicPrefixOption: 'mqtt.topicPrefix',
	commandTopicOption: 'mqtt.commandTopic',

	availability: {
		subtopic: 'connected', retained: true, online: 'true', offline: 'false',
		description: 'The broker publishes `false` on this topic as the last will when the app disconnects without saying so; the app publishes `true` on connect and `false` on a clean disconnect.',
	},

	// `option` names the config key of the subtopic; `derivedDefault` is the fallback when it is unset.
	// Every topic is published to <topicPrefix>/<subtopic>.
	topics: [
		{
			id: 'status', option: 'mqtt.statusTopic', retained: true, gate: null, state: ['presenceStatus', 'presenceStatusCode'],
			description: 'Your presence, published when it changes.',
			payload: {
				format: 'json',
				required: ['status', 'statusCode', 'timestamp', 'clientId'],
				properties: {
					status: { type: 'string', enum: PRESENCE_NAMES, description: 'Presence name.' },
					statusCode: { type: 'integer', description: 'Numeric presence code.' },
					timestamp: { type: 'string', format: 'date-time', description: 'When the message was published.' },
					clientId: { type: 'string', description: 'The mqtt.clientId of the publisher.' },
				},
			},
		},
		{
			id: 'inCall', option: 'mqtt.mediaTopics.inCall', retained: true, gate: null, state: ['inCall'],
			description: 'Whether a call is connected.', payload: BOOLEAN_TEXT,
		},
		{
			id: 'incomingCall', option: 'mqtt.mediaTopics.incomingCall', retained: true, gate: null, state: ['incomingCall'],
			description: 'Whether a call is ringing.', payload: BOOLEAN_TEXT,
		},
		{
			id: 'meetingStarted', option: 'mqtt.mediaTopics.meetingStarted', retained: true, gate: 'mqtt.meetingStartDetection.enabled', state: ['meetingStarted'],
			description: 'A pulse: true when a scheduled meeting is detected as started, false when you join or mqtt.meetingStartDetection.resetSeconds passes.',
			payload: BOOLEAN_TEXT,
		},
		{
			id: 'camera', option: 'mqtt.mediaTopics.camera', retained: true, gate: null, state: ['cameraEnabled'],
			description: 'Whether your camera is on.', payload: BOOLEAN_TEXT,
		},
		{
			id: 'microphone', option: 'mqtt.mediaTopics.microphone', retained: true, gate: null, state: ['microphoneState'],
			description: 'The observed microphone state.', payload: { format: 'text', values: MICROPHONE_PUBLISHED },
		},
		{
			id: 'microphoneControl', option: 'mqtt.mediaTopics.microphoneControl',
			retained: true, gate: null, state: ['microphoneControlState'],
			description: 'The microphone reduced to muted, unmuted or off.', payload: { format: 'text', values: MICROPHONE_CONTROL_PUBLISHED },
		},
		{
			id: 'screenSharing', option: 'mqtt.mediaTopics.screenSharing', retained: true, gate: null, state: ['screenSharing'],
			description: 'Whether you are sharing your screen.', payload: BOOLEAN_TEXT,
		},
		{
			id: 'incomingCallCaller', option: 'mqtt.mediaTopics.incomingCallCaller', derivedDefault: '<incomingCall>/caller',
			retained: false, gate: 'mqtt.incomingCallCaller.enabled', state: ['incomingCallCaller'],
			description: 'Who is calling, published just before the incoming-call topic goes true. Not retained, because it describes a call that is ringing now.',
			payload: {
				format: 'json',
				required: ['timestamp', 'clientId'],
				properties: {
					...Object.fromEntries(CALLER_FIELDS.map(({ name, type, description }) => [name, { type, description }])),
					timestamp: { type: 'string', format: 'date-time', description: 'When the message was published.' },
					clientId: { type: 'string', description: 'The mqtt.clientId of the publisher.' },
				},
			},
		},
		{
			id: 'calendar', fixedSubtopic: 'calendar', retained: false, gate: 'graphApi.enabled', requires: ['mqtt.commandTopic'], command: 'getCalendar',
			description: 'Calendar events, published only in answer to a get-calendar command.',
			payload: {
				format: 'json',
				required: ['success'],
				properties: {
					success: { type: 'boolean', description: 'Always true on this topic; a failed request publishes nothing.' },
					data: { type: 'object', description: 'The Graph calendarView response, with every page merged into its `value` array (at most 50 pages; `@odata.nextLink` is kept when the result is truncated).' },
				},
			},
		},
	],

	// Messages accepted on <topicPrefix>/<mqtt.commandTopic>, a JSON object with an `action`.
	actions: [
		{ action: 'toggle-mute', command: 'toggleMute' },
		{ action: 'mute', command: 'mute' },
		{ action: 'unmute', command: 'unmute' },
		{ action: 'toggle-video', command: 'toggleVideo' },
		{ action: 'toggle-hand-raise', command: 'toggleHandRaise' },
		{ action: 'leave', command: 'leaveCall' },
		{ action: 'get-calendar', command: 'getCalendar' },
	],
};

const dbus = {
	busNameOption: 'dbusControl.busName',
	defaultBusName: 'com.github.IsmaelMartinez.teams_for_linux',
	// When dbusControl.busName is empty the name is this environment variable if set, else the default.
	busNameEnv: 'FLATPAK_ID',
	objectPath: '/com/github/IsmaelMartinez/teams_for_linux',
	interfaceSuffix: 'Control',

	// `in` and `out` are D-Bus type signatures; `command` is the neutral command it dispatches to.
	methods: {
		AcceptAudio: { in: '', out: 'b', command: 'acceptAudio' },
		AcceptVideo: { in: '', out: 'b', command: 'acceptVideo' },
		DeclineCall: { in: '', out: 'b', command: 'declineCall' },
		ToggleMute: { in: '', out: 'b', command: 'toggleMute' },
		Mute: { in: 'b', out: 'b', command: 'mute' },
		Unmute: { in: 'b', out: 'b', command: 'unmute' },
		ToggleVideo: { in: '', out: 'b', command: 'toggleVideo' },
		ToggleHandRaise: { in: '', out: 'b', command: 'toggleHandRaise' },
		LeaveCall: { in: '', out: 'b', command: 'leaveCall' },
		SetStatus: { in: 's', out: 'b', command: 'setStatus' },
		GetState: { in: '', out: 's', command: 'getState' },
	},

	// `signature` is the D-Bus type signature, `args` the argument names, `state` the field(s) carried.
	signals: {
		StateChanged: {
			signature: 's', args: ['stateJson'], state: shared.state.map(({ field }) => field),
		},
		PresenceChanged: { signature: 'si', args: ['status', 'statusCode'], state: ['presenceStatus', 'presenceStatusCode'] },
		InCallChanged: { signature: 'b', args: ['inCall'], state: ['inCall'] },
		IncomingCallChanged: { signature: 'b', args: ['incomingCall'], state: ['incomingCall'] },
		IncomingCallCallerChanged: { signature: 's', args: ['callerJson'], state: ['incomingCallCaller'] },
		CameraChanged: { signature: 'b', args: ['enabled'], state: ['cameraEnabled'] },
		MicrophoneChanged: { signature: 's', args: ['state'], state: ['microphoneState'] },
		MicrophoneControlChanged: { signature: 's', args: ['state'], state: ['microphoneControlState'] },
		ScreenSharingChanged: { signature: 'b', args: ['sharing'], state: ['screenSharing'] },
		MeetingStartedChanged: { signature: 'b', args: ['started'], state: ['meetingStarted'] },
		CallParticipantsChanged: { signature: 's', args: ['participantsJson'], state: ['callParticipants'] },
	},
};

module.exports = { shared, mqtt, dbus };

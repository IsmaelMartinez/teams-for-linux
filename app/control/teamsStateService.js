'use strict';

const { app, ipcMain } = require('electron');
const { EventEmitter } = require('node:events');

const PRESENCE = new Map([
	[-1, 'unknown'], [1, 'available'], [2, 'busy'], [3, 'do_not_disturb'], [4, 'away'], [5, 'be_right_back'],
]);
const MICROPHONE_STATES = new Set(['speaking', 'silent', 'muted', 'off', 'unknown']);
const MICROPHONE_CONTROL = new Map([['muted', 'muted'], ['speaking', 'unmuted'], ['silent', 'unmuted'], ['off', 'off']]);
const microphoneControl = (state) => MICROPHONE_CONTROL.get(state) || 'unknown';
const PROFILE_DEFAULTS = {
	presenceStatus: 'unknown', presenceStatusCode: -1, inCall: false,
	cameraEnabled: false, screenSharing: false, meetingStarted: false,
};

/** Main-process, transport-independent snapshot of the Teams state we observe. */
class TeamsStateService extends EventEmitter {
	constructor(config = {}, { appEmitter = app, ipcEmitter = ipcMain, getActiveWebContents = null } = {}) {
		super();
		this.app = appEmitter;
		this.ipc = ipcEmitter;
		this.getActiveWebContents = getActiveWebContents;
		this.microphoneByContents = new WeakMap();
		this.profileByContents = new WeakMap();
		this.meetingTimers = new Map();
		this.callerEnabled = config.mqtt?.incomingCallCaller?.enabled === true;
		this.resetMs = this.#resetDelay(config.mqtt?.meetingStartDetection?.resetSeconds);
		this.state = {
			presenceStatus: 'unknown', presenceStatusCode: -1, inCall: false, incomingCall: false,
			incomingCallCaller: null, cameraEnabled: false, microphoneState: 'unknown',
			microphoneControlState: 'unknown', screenSharing: false, meetingStarted: false,
		};
		this.initialized = false;
		this.listeners = [];
	}

	#resetDelay(seconds) {
		const value = Number(seconds ?? 10);
		return Number.isFinite(value) && value >= 0 ? Math.min(value * 1000, 2_147_000_000) : 10_000;
	}

	getState() {
		const snapshot = structuredClone(this.state);
		try {
			const active = this.getActiveWebContents?.();
			if (this.getActiveWebContents) {
				Object.assign(snapshot, PROFILE_DEFAULTS, active ? this.profileByContents.get(active) : {},
					active ? this.microphoneByContents.get(active) || {} : {});
				if (!active || !this.microphoneByContents.has(active)) {
					snapshot.microphoneState = 'unknown';
					snapshot.microphoneControlState = 'unknown';
				}
			}
		} catch {
			Object.assign(snapshot, PROFILE_DEFAULTS, { microphoneState: 'unknown', microphoneControlState: 'unknown' });
		}
		return snapshot;
	}

	#update(changes) {
		let changed = false;
		for (const [key, value] of Object.entries(changes)) {
			if (JSON.stringify(this.state[key]) !== JSON.stringify(value)) {
				this.state[key] = value;
				changed = true;
			}
		}
		if (changed) this.emit('state-changed', this.getState());
		return changed;
	}

	#updateProfile(sender, changes) {
		const previous = JSON.stringify(this.getState());
		if (sender && typeof sender === 'object') {
			this.profileByContents.set(sender, { ...this.profileByContents.get(sender), ...changes });
		}
		if (this.getActiveWebContents) {
			let active;
			try { active = this.getActiveWebContents(); } catch { return; }
			if (!active || active !== sender) return;
		}
		const changed = this.#update(changes);
		if (!changed && previous !== JSON.stringify(this.getState())) this.emit('state-changed', this.getState());
	}

	setPresence(statusCode, sender) {
		if (!Number.isInteger(statusCode) || statusCode < -2_147_483_648 || statusCode > 2_147_483_647) return false;
		this.#updateProfile(sender, { presenceStatusCode: statusCode, presenceStatus: PRESENCE.get(statusCode) || 'unknown' });
		return true;
	}

	initialize() {
		if (this.initialized) return;
		this.initialized = true;
		const on = (emitter, event, handler) => {
			emitter.on(event, handler);
			this.listeners.push([emitter, event, handler]);
		};
		on(this.ipc, 'camera-state-changed', (event, enabled) => {
			if (typeof enabled === 'boolean') this.#updateProfile(event?.sender, { cameraEnabled: enabled });
		});
		on(this.ipc, 'microphone-state-changed', (event, state) => {
			if (!MICROPHONE_STATES.has(state)) return;
			const previous = this.getState();
			let active = null;
			try { active = this.getActiveWebContents?.() || null; } catch { /* Startup/shutdown. */ }
			if (event?.sender && typeof event.sender === 'object') {
				this.microphoneByContents.set(event.sender, { microphoneState: state, microphoneControlState: microphoneControl(state) });
				if (this.getActiveWebContents && active !== event.sender) return;
			}
			if (this.getActiveWebContents && (!active || !event?.sender)) return;
			this.#setMicrophone(state, previous);
		});
		on(this.ipc, 'screen-sharing-started', (event) => this.#updateProfile(event?.sender, { screenSharing: true }));
		on(this.ipc, 'screen-sharing-stopped', (event) => this.#updateProfile(event?.sender, { screenSharing: false }));
		on(this.ipc, 'meeting-started', (event) => this.#startMeetingPulse(event?.sender));
		on(this.app, 'teams-call-connected', (sender) => {
			this.#updateProfile(sender, { inCall: true });
			this.#clearMeetingPulse(sender);
		});
		on(this.app, 'teams-call-disconnected', (sender) => {
			this.#updateProfile(sender, { inCall: false, cameraEnabled: false, screenSharing: false });
			const previousMicrophone = this.getState();
			try {
				const active = this.getActiveWebContents?.();
				const target = sender && typeof sender === 'object' ? sender : active;
				if (target) this.microphoneByContents.set(target, { microphoneState: 'off', microphoneControlState: 'off' });
				// A background account ending its call must not invalidate the active
				// account's microphone observation (and consequently its mute guard).
				if (this.getActiveWebContents && (!active || sender !== active)) return;
			} catch { /* Main window may already be shutting down. */ }
			this.#setMicrophone('off', previousMicrophone);
		});
		on(this.app, 'teams-incoming-call-started', (details) => {
			this.#update({ incomingCall: true, incomingCallCaller: this.callerEnabled ? this.#sanitizeCaller(details) : null });
		});
		on(this.app, 'teams-incoming-call-ended', () => this.#update({ incomingCall: false, incomingCallCaller: null }));
	}

	#sanitizeCaller(details) {
		if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
		const caller = {};
		for (const key of ['scenario', 'number', 'name', 'queue', 'contact', 'callId']) {
			const value = details[key];
			if (value !== undefined && value !== null && ['string', 'number', 'boolean'].includes(typeof value)) caller[key] = value;
		}
		return Object.keys(caller).length ? caller : null;
	}

	#setMicrophone(state, previous = this.getState()) {
		if (!MICROPHONE_STATES.has(state)) return;
		const changed = this.#update({ microphoneState: state, microphoneControlState: microphoneControl(state) });
		const current = this.getState();
		if (!changed && (previous.microphoneState !== current.microphoneState
			|| previous.microphoneControlState !== current.microphoneControlState)) {
			this.emit('state-changed', current);
		}
	}

	#startMeetingPulse(sender) {
		const timer = this.meetingTimers.get(sender);
		if (timer) clearTimeout(timer);
		this.#updateProfile(sender, { meetingStarted: true });
		const next = setTimeout(() => {
			this.meetingTimers.delete(sender);
			this.#updateProfile(sender, { meetingStarted: false });
		}, this.resetMs);
		next.unref?.();
		this.meetingTimers.set(sender, next);
	}

	#clearMeetingPulse(sender) {
		const timer = this.meetingTimers.get(sender);
		if (timer) clearTimeout(timer);
		this.meetingTimers.delete(sender);
		this.#updateProfile(sender, { meetingStarted: false });
	}

	dispose() {
		for (const [emitter, event, handler] of this.listeners) emitter.removeListener(event, handler);
		this.listeners = [];
		this.initialized = false;
		for (const timer of this.meetingTimers.values()) clearTimeout(timer);
		this.meetingTimers.clear();
	}
}

module.exports = TeamsStateService;

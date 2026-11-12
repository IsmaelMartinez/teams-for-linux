"use strict";

/**
 * Call Participants Browser Tool
 *
 * Reads who is in the current call and who is speaking from the meeting stage,
 * and forwards it to the main process for the opt-in D-Bus Control API
 * (`CallParticipantsChanged`). Meant for local note takers and accessibility
 * helpers that need to attribute speech without reading the screen.
 *
 * Source: each remote participant tile carries Teams' own test id
 * `data-tid="voice-level-stream-outline"`. While that person speaks, Teams
 * draws the speaking outline as the element's ::before (opacity 1); silent or
 * muted it is transparent (opacity 0). The display name is the tile's text.
 * Only the `data-tid` and the computed outline are used, never the generated
 * class names, which change between Teams releases.
 *
 * Scope and limits:
 * - Remote participants on the stage only. Large meetings page their tiles, so
 *   people off the current page are not listed. Your own state is already
 *   published as `MicrophoneChanged`.
 * - Runs only on Linux with `dbusControl.enabled` and
 *   `dbusControl.callParticipants` both true, and only while in a call.
 * - Participant names are personal data. They go to the main process over
 *   IPC and from there only to the local session bus; they are never logged.
 */
const activityHub = require("./activityHub");

const LOG_PREFIX = "[CALL_PARTICIPANTS]";
const POLL_INTERVAL_MS = 500;
const MAX_PARTICIPANTS = 100;
const MAX_NAME_LENGTH = 128;
const OUTLINE_SELECTOR = '[data-tid="voice-level-stream-outline"]';

/** Pure reader, exported for tests: the stage as [{ name, speaking }], sorted by name. */
function readStage(doc = globalThis.document, getStyle = globalThis.getComputedStyle) {
	const byName = new Map();
	for (const outline of doc?.querySelectorAll?.(OUTLINE_SELECTOR) ?? []) {
		const name = tileName(outline);
		if (!name) continue;
		const speaking = isSpeaking(outline, getStyle);
		// The same person can appear twice (e.g. tile + spotlight); speaking wins.
		byName.set(name, (byName.get(name) ?? false) || speaking);
		if (byName.size >= MAX_PARTICIPANTS) break;
	}
	return [...byName].map(([name, speaking]) => ({ name, speaking }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function tileName(outline) {
	const text = outline?.parentElement?.innerText ?? outline?.parentElement?.textContent ?? "";
	const first = text.split("\n").map((line) => line.trim()).find(Boolean);
	return first ? first.slice(0, MAX_NAME_LENGTH) : null;
}

function isSpeaking(outline, getStyle) {
	try {
		const opacity = Number.parseFloat(getStyle(outline, "::before")?.opacity);
		return Number.isFinite(opacity) && opacity > 0.5;
	} catch {
		return false;
	}
}

class CallParticipants {
	#ipcRenderer = null;
	#timer = null;
	#last = null;

	init(config, ipcRenderer) {
		const enabled = process.platform === "linux"
			&& config?.dbusControl?.enabled === true
			&& config?.dbusControl?.callParticipants === true;
		if (!enabled || !ipcRenderer) return;
		this.#ipcRenderer = ipcRenderer;
		activityHub.on("call-connected", () => this.#start());
		activityHub.on("call-disconnected", () => this.#stop());
		console.info(`${LOG_PREFIX} Initialized`);
	}

	#start() {
		if (this.#timer) return;
		this.#last = null;
		this.#timer = setInterval(() => this.#poll(), POLL_INTERVAL_MS);
	}

	#stop() {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
		this.#send([]);
		this.#last = null;
	}

	#poll() {
		try {
			this.#send(readStage());
		} catch (error) {
			console.debug(`${LOG_PREFIX} Stage read failed`, { error: error?.name });
		}
	}

	#send(participants) {
		const json = JSON.stringify(participants);
		if (json === this.#last) return;
		this.#last = json;
		this.#ipcRenderer?.send("call-participants-changed", participants);
	}
}

module.exports = new CallParticipants();
module.exports.readStage = readStage;

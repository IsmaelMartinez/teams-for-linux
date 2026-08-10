/**
 * Meeting Start Detector (#2587, Phase 2 of #2370)
 *
 * Best-effort detection of the "<name> started the meeting" toast that Teams
 * shows when someone explicitly starts a scheduled meeting. On detection an
 * IPC event is sent to the main process, which publishes a short "true"
 * pulse to the {topicPrefix}/meeting-started MQTT topic.
 *
 * IMPORTANT: This is inherently fragile (Path A of #2587). Teams renders the
 * toast text in the UI language and can reword it without notice, so the
 * match patterns are configurable via `mqtt.meetingStartDetection.patterns`
 * (case-insensitive regular expressions). The default only covers English.
 * Making the patterns user-configurable rather than hard-coded came from
 * Hoàng Anh Vũ's detector in #2745, folded in here.
 *
 * Scoping strategy:
 * 1. Try to observe a known toast container region (narrowest scope).
 * 2. Fall back to observing document.body, but only ever run text matching
 *    against elements that look like toast/alert surfaces (role="alert",
 *    aria-live regions, toast/notification data-tids). Ordinary chat
 *    messages carry none of these markers, so a chat message such as
 *    "the meeting started late" is never scanned.
 *
 * PII: the matched toast text contains a person's name. It is never logged
 * and never sent over IPC or MQTT; only the fact that a match occurred is.
 */

// Default match patterns (case-insensitive). English-only; non-English Teams
// users must configure `mqtt.meetingStartDetection.patterns` for their locale.
// 'meeting started' verified live 2026-07-28: the status-bar banner reads
// "Meeting Started: <subject>". 'started the meeting' kept for the
// person-initiated toast phrasing.
const DEFAULT_PATTERNS = ["meeting started", "started the meeting"];

// Best-guess selectors for the Teams toast/notification region. These are
// unverified against the live Teams DOM (it changes without notice); when
// none match at start-up we fall back to observing document.body.
const TOAST_CONTAINER_SELECTORS = [
	'[data-tid="toast-container"]',
	'[data-tester-id="toast-container"]',
	'[data-tid*="in-app-notification" i]',
];

// Structural markers of toast/alert surfaces. Text matching only runs on
// elements matching this selector, never on arbitrary DOM additions.
const TOAST_MARKER_SELECTOR = [
	'[role="alert"]',
	'[role="status"]',
	'[aria-live="polite"]',
	'[aria-live="assertive"]',
	'[data-tid*="toast" i]',
	'[data-tid*="notification" i]',
].join(', ');

// Bound regex work per toast and cap how long a text signature is remembered.
const MAX_TEXT_LENGTH = 1000;
const DEDUP_WINDOW_MS = 60000;

// A meeting is long-lived: while it stays active and nobody joins (exactly the
// away-from-screen case this feature targets) Teams keeps the live-meeting
// status bar mounted and can re-emit its command on re-render or view change.
// Publishing a fresh "meeting started" pulse each time would re-trigger the
// user's automations throughout the meeting, so a given meeting id is only
// allowed to fire once per plausible meeting lifetime.
const MEETING_DEDUP_WINDOW_MS = 4 * 60 * 60 * 1000;

const activityHub = require('./activityHub');

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Non-cryptographic string hash (djb2). Used so matched toast text (which
 * contains a person's name) is not retained verbatim for deduplication.
 */
function hashText(text) {
	let hash = 5381;
	// Iterate code points, not code units: stepping by one unit while reading a
	// full code point would hash a surrogate pair's lead twice.
	for (const ch of text) {
		// "| 0" is the 32-bit wrap djb2 relies on, not a truncation.
		hash = ((hash << 5) + hash + ch.codePointAt(0)) | 0;
	}
	return hash;
}

class MeetingStartDetector {
	#ipcRenderer;
	#patterns = [];
	#observer = null;
	#matchedElements = new WeakSet();
	#recentSignatures = new Map();

	init(config, ipcRenderer) {
		this.#ipcRenderer = ipcRenderer;

		const detectionConfig = config.mqtt?.meetingStartDetection;
		if (!config.mqtt?.enabled || !detectionConfig?.enabled) {
			console.debug('[MeetingStartDetector] Disabled');
			return;
		}

		this.#patterns = this.compilePatterns(detectionConfig.patterns);
		if (this.#patterns.length === 0) {
			console.warn('[MeetingStartDetector] No valid patterns configured, detection disabled');
			return;
		}

		// Primary detection path: Teams' own command-reporting stream, which
		// carries the meeting-start banner/toast as structured, locale
		// independent data (see getMeetingStartId in activityHub.js). The DOM
		// observer below stays as a fallback for sessions where the React
		// internals are unavailable.
		activityHub.on('meeting-started', (data) => this.#onReactMeetingStart(data));

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => this.#start());
		} else {
			// Give Teams time to fully load (same grace period as mqttStatusMonitor)
			setTimeout(() => this.#start(), 3000);
		}
	}

	/**
	 * Teams re-emits the same banner command several times per meeting start,
	 * so dedup on the meeting's callId/toastId (falling back to a fixed key
	 * when no id is present) for the meeting-length window.
	 */
	#onReactMeetingStart(data) {
		const signature = `react:${data?.id ?? 'meeting-start'}`;
		if (this.#isDuplicateSignature(signature, MEETING_DEDUP_WINDOW_MS)) {
			console.debug('[MeetingStartDetector] Duplicate meeting-start command, skipping');
			return;
		}
		// PII: the id is a call/toast GUID, not a person; still not logged.
		console.info('[MeetingStartDetector] Meeting start detected via command stream');
		this.#ipcRenderer.send('meeting-started');
	}

	/**
	 * Compile configured pattern strings into case-insensitive RegExps.
	 * Falls back to DEFAULT_PATTERNS when none are configured; invalid
	 * expressions are skipped with a warning (index only, never the text
	 * being matched later).
	 *
	 * @param {string[]|undefined} patterns
	 * @returns {RegExp[]}
	 */
	compilePatterns(patterns) {
		const source = Array.isArray(patterns) && patterns.length > 0 ? patterns : DEFAULT_PATTERNS;
		const compiled = [];
		source.forEach((pattern, index) => {
			try {
				compiled.push(new RegExp(pattern, 'i'));
			} catch (error) {
				console.warn(`[MeetingStartDetector] Ignoring invalid pattern at index ${index}:`, error.message);
			}
		});
		return compiled;
	}

	/**
	 * @param {string} text
	 * @returns {boolean} true when any configured pattern matches
	 */
	matchesPatterns(text) {
		if (typeof text !== 'string' || text.length === 0) {
			return false;
		}
		const bounded = text.slice(0, MAX_TEXT_LENGTH);
		return this.#patterns.some((pattern) => pattern.test(bounded));
	}

	#start() {
		if (this.#observer) {
			return;
		}

		const container = this.#findToastContainer();
		const target = container || document.body;
		if (!target) {
			console.warn('[MeetingStartDetector] No observable DOM target found');
			return;
		}

		this.#observer = new MutationObserver((mutations) => {
			try {
				this.#onMutations(mutations);
			} catch (error) {
				console.error('[MeetingStartDetector] Observer callback error:', error.message);
			}
		});
		this.#observer.observe(target, { childList: true, subtree: true });

		console.info('[MeetingStartDetector] Started', {
			scopedToContainer: !!container,
			patternCount: this.#patterns.length,
		});
	}

	#findToastContainer() {
		for (const selector of TOAST_CONTAINER_SELECTORS) {
			try {
				const element = document.querySelector(selector);
				if (element) {
					return element;
				}
			} catch {
				// invalid/unsupported selector — try the next one
			}
		}
		return null;
	}

	#onMutations(mutations) {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node.nodeType === ELEMENT_NODE) {
					this.#checkMarkers(this.#collectMarkerElements(node));
				} else if (node.nodeType === TEXT_NODE && mutation.target?.closest) {
					// Toast text can be filled in after the element is inserted;
					// re-check the enclosing marker when its text arrives.
					const host = mutation.target.closest(TOAST_MARKER_SELECTOR);
					if (host) {
						this.#checkMarkers([host]);
					}
				}
			}
		}
	}

	#collectMarkerElements(node) {
		const markers = [];
		if (node.matches?.(TOAST_MARKER_SELECTOR)) {
			markers.push(node);
		}
		if (typeof node.querySelectorAll === 'function') {
			markers.push(...node.querySelectorAll(TOAST_MARKER_SELECTOR));
		}
		return markers;
	}

	#checkMarkers(elements) {
		for (const element of elements) {
			if (this.#matchedElements.has(element)) {
				continue;
			}

			const text = element.textContent || '';
			if (!this.matchesPatterns(text)) {
				continue;
			}

			this.#matchedElements.add(element);
			if (this.#isDuplicateSignature(text.slice(0, MAX_TEXT_LENGTH))) {
				console.debug('[MeetingStartDetector] Duplicate toast within dedup window, skipping');
				continue;
			}

			// PII: never include the matched text — it carries a person's name.
			console.info('[MeetingStartDetector] Meeting-start toast detected');
			this.#ipcRenderer.send('meeting-started');
		}
	}

	/**
	 * Deduplication for both detection paths: Teams can re-render the same
	 * toast as a new DOM element and can re-emit the same status-bar command,
	 * so element identity alone is not enough. Signatures are hashes (no
	 * verbatim text retained) and each carries its own expiry, so distinct
	 * meetings still fire while one meeting cannot fire twice.
	 *
	 * @param {string} key text or identifier to deduplicate on
	 * @param {number} windowMs how long this key stays suppressed
	 */
	#isDuplicateSignature(key, windowMs = DEDUP_WINDOW_MS) {
		const now = Date.now();
		for (const [signature, entry] of this.#recentSignatures) {
			if (now - entry.at > entry.ttl) {
				this.#recentSignatures.delete(signature);
			}
		}

		const signature = hashText(key);
		if (this.#recentSignatures.has(signature)) {
			return true;
		}
		this.#recentSignatures.set(signature, { at: now, ttl: windowMs });
		return false;
	}

	stop() {
		if (this.#observer) {
			this.#observer.disconnect();
			this.#observer = null;
		}
		this.#recentSignatures.clear();
		console.debug('[MeetingStartDetector] Stopped');
	}
}

module.exports = new MeetingStartDetector();

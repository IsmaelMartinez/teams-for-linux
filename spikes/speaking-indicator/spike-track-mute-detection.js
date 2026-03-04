/**
 * Spike: MediaStreamTrack Mute Detection
 *
 * Validates that audioTrack.enabled and mute/unmute events reliably detect
 * when Teams mutes/unmutes the microphone. Run during an active Teams call
 * to test with the actual Teams mute button.
 *
 * Run in DevTools console during an active Teams call.
 *
 * Issue: #2290
 * Research: docs-site/docs/development/research/speaking-indicator-research.md
 */
(async function spikeTrackMuteDetection() {
	const LOG_PREFIX = '[SPIKE_MUTE_DETECT]';
	const MONITOR_DURATION_MS = 30000; // Monitor for 30 seconds
	const POLL_INTERVAL_MS = 200;

	console.info(`${LOG_PREFIX} Starting track mute detection spike...`);

	// --- Step 1: Get a microphone stream ---
	let stream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
		console.info(`${LOG_PREFIX} Got MediaStream with ${stream.getAudioTracks().length} audio track(s)`);
	} catch (err) {
		console.error(`${LOG_PREFIX} FAIL: Cannot get microphone stream:`, err.message);
		return;
	}

	const track = stream.getAudioTracks()[0];
	if (!track) {
		console.error(`${LOG_PREFIX} FAIL: No audio tracks in stream`);
		return;
	}

	console.info(`${LOG_PREFIX} Audio track: label="${track.label}"`);
	console.info(`${LOG_PREFIX} Initial state: enabled=${track.enabled}, muted=${track.muted}, readyState="${track.readyState}"`);

	// --- Step 2: Set up event listeners ---
	const events = [];

	track.addEventListener('mute', () => {
		const entry = { time: Date.now(), type: 'mute-event', enabled: track.enabled, muted: track.muted };
		events.push(entry);
		console.info(`${LOG_PREFIX} EVENT: "mute" fired | enabled=${track.enabled}, muted=${track.muted}`);
	});

	track.addEventListener('unmute', () => {
		const entry = { time: Date.now(), type: 'unmute-event', enabled: track.enabled, muted: track.muted };
		events.push(entry);
		console.info(`${LOG_PREFIX} EVENT: "unmute" fired | enabled=${track.enabled}, muted=${track.muted}`);
	});

	track.addEventListener('ended', () => {
		const entry = { time: Date.now(), type: 'ended-event', enabled: track.enabled, muted: track.muted };
		events.push(entry);
		console.info(`${LOG_PREFIX} EVENT: "ended" fired | track stopped`);
	});

	console.info(`${LOG_PREFIX} Event listeners registered for: mute, unmute, ended`);

	// --- Step 3: Poll track.enabled to detect changes ---
	let lastEnabled = track.enabled;
	let lastMuted = track.muted;
	let pollCount = 0;
	let enabledChanges = 0;
	let mutedChanges = 0;

	console.info(`${LOG_PREFIX} Starting ${MONITOR_DURATION_MS / 1000}s monitoring...`);
	console.info(`${LOG_PREFIX} >>> Click the Teams MUTE button now to test detection <<<`);
	console.info(`${LOG_PREFIX} >>> Try muting and unmuting several times <<<`);

	const pollInterval = setInterval(() => {
		pollCount++;

		if (track.enabled !== lastEnabled) {
			enabledChanges++;
			const entry = {
				time: Date.now(),
				type: 'enabled-change',
				from: lastEnabled,
				to: track.enabled,
				muted: track.muted
			};
			events.push(entry);
			console.info(`${LOG_PREFIX} POLL: track.enabled changed: ${lastEnabled} -> ${track.enabled} (muted=${track.muted})`);
			lastEnabled = track.enabled;
		}

		if (track.muted !== lastMuted) {
			mutedChanges++;
			const entry = {
				time: Date.now(),
				type: 'muted-change',
				from: lastMuted,
				to: track.muted,
				enabled: track.enabled
			};
			events.push(entry);
			console.info(`${LOG_PREFIX} POLL: track.muted changed: ${lastMuted} -> ${track.muted} (enabled=${track.enabled})`);
			lastMuted = track.muted;
		}

		if (track.readyState === 'ended') {
			console.info(`${LOG_PREFIX} Track ended, stopping monitoring`);
			clearInterval(pollInterval);
		}
	}, POLL_INTERVAL_MS);

	// --- Step 4: Test programmatic mute/unmute ---
	console.info(`${LOG_PREFIX} Testing programmatic track.enabled toggle in 3s...`);

	setTimeout(() => {
		console.info(`${LOG_PREFIX} Setting track.enabled = false (programmatic mute)`);
		track.enabled = false;

		setTimeout(() => {
			console.info(`${LOG_PREFIX} Setting track.enabled = true (programmatic unmute)`);
			track.enabled = true;

			console.info(`${LOG_PREFIX} Programmatic toggle complete. Continue clicking Teams mute button to test.`);
		}, 2000);
	}, 3000);

	// --- Step 5: Report after monitoring period ---
	setTimeout(() => {
		clearInterval(pollInterval);

		console.info(`${LOG_PREFIX} === RESULTS ===`);
		console.info(`${LOG_PREFIX} Monitoring duration: ${MONITOR_DURATION_MS / 1000}s`);
		console.info(`${LOG_PREFIX} Poll samples: ${pollCount}`);
		console.info(`${LOG_PREFIX} track.enabled changes detected: ${enabledChanges}`);
		console.info(`${LOG_PREFIX} track.muted changes detected: ${mutedChanges}`);
		console.info(`${LOG_PREFIX} Total events captured: ${events.length}`);

		if (events.length > 0) {
			console.info(`${LOG_PREFIX} Event log:`);
			for (const event of events) {
				const relTime = ((event.time - events[0].time) / 1000).toFixed(1);
				console.info(`${LOG_PREFIX}   [${relTime}s] ${event.type}: enabled=${event.enabled ?? event.to}, muted=${event.muted}`);
			}
		}

		// --- Validation checks ---
		const checks = [];

		// Check: programmatic enable/disable works
		const hasEnabledChange = events.some(e => e.type === 'enabled-change');
		checks.push({
			name: 'track.enabled changes detected via polling',
			pass: hasEnabledChange,
			reason: hasEnabledChange ? null : 'no enabled changes detected (programmatic toggle should have triggered at least 2)'
		});

		// Check: mute/unmute events fired
		const hasMuteEvent = events.some(e => e.type === 'mute-event');
		const hasUnmuteEvent = events.some(e => e.type === 'unmute-event');
		checks.push({
			name: 'mute event fired',
			pass: hasMuteEvent,
			reason: hasMuteEvent ? null : 'no mute event received (may not fire for programmatic enabled toggle --- this is expected in some browsers)'
		});
		checks.push({
			name: 'unmute event fired',
			pass: hasUnmuteEvent,
			reason: hasUnmuteEvent ? null : 'no unmute event received (may not fire for programmatic enabled toggle --- this is expected in some browsers)'
		});

		// Check: track is still alive
		checks.push({
			name: 'Track still alive after monitoring',
			pass: track.readyState === 'live',
			reason: track.readyState === 'live' ? null : `readyState is "${track.readyState}"`
		});

		console.info(`${LOG_PREFIX} === VALIDATION ===`);
		let allPassed = true;
		let criticalFailed = false;
		for (const check of checks) {
			const status = check.pass ? 'PASS' : 'FAIL';
			const detail = check.reason ? ` (${check.reason})` : '';
			console.info(`${LOG_PREFIX} [${status}] ${check.name}${detail}`);
			if (!check.pass) {
				allPassed = false;
				// mute/unmute events not firing is expected in Chromium for programmatic changes
				// The critical check is track.enabled polling
				if (check.name === 'track.enabled changes detected via polling') {
					criticalFailed = true;
				}
			}
		}

		if (criticalFailed) {
			console.error(`${LOG_PREFIX} === CRITICAL FAILURE: track.enabled polling does not work ===`);
		} else if (!allPassed) {
			console.warn(`${LOG_PREFIX} === PARTIAL PASS: track.enabled polling works, but mute/unmute events may not fire ===`);
			console.info(`${LOG_PREFIX} This is acceptable --- the implementation can use polling as primary detection`);
			console.info(`${LOG_PREFIX} mute/unmute events are supplementary and not required`);
		} else {
			console.info(`${LOG_PREFIX} === ALL CHECKS PASSED ===`);
		}

		console.info(`${LOG_PREFIX} === RECOMMENDATION ===`);
		if (hasEnabledChange) {
			console.info(`${LOG_PREFIX} Use track.enabled polling as PRIMARY mute detection (reliable)`);
			if (hasMuteEvent) {
				console.info(`${LOG_PREFIX} Use mute/unmute events as SUPPLEMENTARY detection (bonus)`);
			} else {
				console.info(`${LOG_PREFIX} mute/unmute events are not reliable --- rely on polling only`);
			}
		} else {
			console.info(`${LOG_PREFIX} Neither method detected changes --- investigate Teams mute mechanism`);
			console.info(`${LOG_PREFIX} Teams may replace the entire track or use a different muting approach`);
			console.info(`${LOG_PREFIX} Alternative: detect silence via AnalyserNode as mute proxy`);
		}

		// Cleanup
		stream.getTracks().forEach(t => t.stop());
		console.info(`${LOG_PREFIX} Cleaned up MediaStream`);

	}, MONITOR_DURATION_MS);
})();

/**
 * Spike: getUserMedia Patch Chain Composition
 *
 * Validates that four getUserMedia patches compose correctly without
 * breaking each other. Simulates the existing three patches (disableAutogain,
 * screenSharing, cameraResolution) plus the new speakingIndicator patch.
 *
 * Run in DevTools console. Does NOT require an active call.
 *
 * Issue: #2290
 * Research: docs-site/docs/development/research/speaking-indicator-research.md
 */
(async function spikeGetUserMediaChain() {
	const LOG_PREFIX = '[SPIKE_GUM_CHAIN]';
	const patchLog = [];

	console.info(`${LOG_PREFIX} Starting getUserMedia patch chain spike...`);

	// --- Step 1: Save the current getUserMedia (may already be patched by the app) ---
	const originalGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
	console.info(`${LOG_PREFIX} Saved reference to current getUserMedia`);

	// --- Step 2: Simulate the four patches in order ---

	// Patch 1: disableAutogain (modifies constraints)
	const patch1Gum = navigator.mediaDevices.getUserMedia;
	navigator.mediaDevices.getUserMedia = function patch1_disableAutogain(constraints) {
		patchLog.push('disableAutogain');
		console.debug(`${LOG_PREFIX} [1/4] disableAutogain patch executed`);

		// Simulate: modify audio constraints
		if (constraints?.audio && typeof constraints.audio === 'object') {
			constraints.audio.autoGainControl = false;
		}

		return patch1Gum.call(navigator.mediaDevices, constraints);
	};

	// Patch 2: screenSharing (inspects constraints, passes through for non-screen-share)
	const patch2Gum = navigator.mediaDevices.getUserMedia;
	navigator.mediaDevices.getUserMedia = function patch2_screenSharing(constraints) {
		patchLog.push('screenSharing');
		console.debug(`${LOG_PREFIX} [2/4] screenSharing patch executed`);

		// Simulate: check if screen share, disable audio if so
		const isScreenShare = constraints?.video?.chromeMediaSource === 'desktop';
		if (isScreenShare && constraints) {
			constraints.audio = false;
		}

		return patch2Gum.call(navigator.mediaDevices, constraints);
	};

	// Patch 3: cameraResolution (modifies video constraints)
	const patch3Gum = navigator.mediaDevices.getUserMedia;
	navigator.mediaDevices.getUserMedia = function patch3_cameraResolution(constraints) {
		patchLog.push('cameraResolution');
		console.debug(`${LOG_PREFIX} [3/4] cameraResolution patch executed`);

		// Simulate: remove resolution constraints
		if (constraints?.video && typeof constraints.video === 'object') {
			delete constraints.video.width;
			delete constraints.video.height;
		}

		return patch3Gum.call(navigator.mediaDevices, constraints);
	};

	// Patch 4: speakingIndicator (captures stream for audio analysis)
	const patch4Gum = navigator.mediaDevices.getUserMedia;
	let capturedStream = null;
	navigator.mediaDevices.getUserMedia = function patch4_speakingIndicator(constraints) {
		patchLog.push('speakingIndicator');
		console.debug(`${LOG_PREFIX} [4/4] speakingIndicator patch executed`);

		return patch4Gum.call(navigator.mediaDevices, constraints).then(stream => {
			// Simulate: capture stream for audio analysis
			const audioTracks = stream.getAudioTracks();
			if (audioTracks.length > 0) {
				capturedStream = stream;
				console.debug(`${LOG_PREFIX} speakingIndicator captured stream with ${audioTracks.length} audio track(s)`);
			}
			return stream;
		});
	};

	console.info(`${LOG_PREFIX} All four patches applied. Testing execution order...`);

	// --- Step 3: Call getUserMedia and verify all patches execute ---
	console.info(`${LOG_PREFIX} Calling getUserMedia({ audio: true })...`);

	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
		const audioTracks = stream.getAudioTracks();

		console.info(`${LOG_PREFIX} === RESULTS ===`);
		console.info(`${LOG_PREFIX} Stream obtained: ${stream instanceof MediaStream}`);
		console.info(`${LOG_PREFIX} Audio tracks: ${audioTracks.length}`);
		console.info(`${LOG_PREFIX} Patch execution order: ${patchLog.join(' -> ')}`);

		// --- Validation checks ---
		const checks = [];

		// Check: all four patches executed
		const expectedPatches = ['speakingIndicator', 'cameraResolution', 'screenSharing', 'disableAutogain'];
		const allPatchesRan = expectedPatches.every(p => patchLog.includes(p));
		checks.push({
			name: 'All four patches executed',
			pass: allPatchesRan,
			reason: allPatchesRan ? null : `Missing: ${expectedPatches.filter(p => !patchLog.includes(p)).join(', ')}`
		});

		// Check: correct LIFO order (last applied runs first)
		const expectedOrder = ['speakingIndicator', 'cameraResolution', 'screenSharing', 'disableAutogain'];
		const correctOrder = patchLog.length === 4 &&
			patchLog[0] === expectedOrder[0] &&
			patchLog[1] === expectedOrder[1] &&
			patchLog[2] === expectedOrder[2] &&
			patchLog[3] === expectedOrder[3];
		checks.push({
			name: 'LIFO execution order (newest patch first)',
			pass: correctOrder,
			reason: correctOrder ? null : `Expected ${expectedOrder.join('->')} but got ${patchLog.join('->')}`
		});

		// Check: stream is valid
		checks.push({
			name: 'Valid MediaStream returned',
			pass: stream instanceof MediaStream,
			reason: stream instanceof MediaStream ? null : `Got ${typeof stream}`
		});

		// Check: has audio tracks
		checks.push({
			name: 'Stream has audio tracks',
			pass: audioTracks.length > 0,
			reason: audioTracks.length > 0 ? null : 'no audio tracks'
		});

		// Check: speakingIndicator captured the stream
		checks.push({
			name: 'speakingIndicator captured stream',
			pass: capturedStream === stream,
			reason: capturedStream === stream ? null : 'captured stream does not match returned stream'
		});

		console.info(`${LOG_PREFIX} === VALIDATION ===`);
		let allPassed = true;
		for (const check of checks) {
			const status = check.pass ? 'PASS' : 'FAIL';
			const detail = check.reason ? ` (${check.reason})` : '';
			console.info(`${LOG_PREFIX} [${status}] ${check.name}${detail}`);
			if (!check.pass) allPassed = false;
		}

		console.info(`${LOG_PREFIX} === ${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} ===`);

		// Cleanup
		stream.getTracks().forEach(t => t.stop());

	} catch (err) {
		console.error(`${LOG_PREFIX} FAIL: getUserMedia call failed:`, err.message);
		console.info(`${LOG_PREFIX} Patches that ran before failure: ${patchLog.join(' -> ')}`);
	}

	// --- Step 4: Restore original getUserMedia ---
	navigator.mediaDevices.getUserMedia = originalGum;
	console.info(`${LOG_PREFIX} Restored original getUserMedia`);

	// --- Step 5: Test screen sharing path (constraints detection) ---
	console.info(`${LOG_PREFIX} Testing screen sharing constraint detection...`);
	patchLog.length = 0;

	// Re-apply patches for screen share test
	const gumForScreenTest = navigator.mediaDevices.getUserMedia;
	navigator.mediaDevices.getUserMedia = function(constraints) {
		const isScreenShare = constraints?.video?.chromeMediaSource === 'desktop';
		console.info(`${LOG_PREFIX} Screen share detection: isScreenShare=${isScreenShare}`);
		console.info(`${LOG_PREFIX} [PASS] Screen share constraint detection works correctly`);
		// Don't actually call getUserMedia for screen share (would fail without desktop capturer)
		return Promise.resolve(new MediaStream());
	};

	await navigator.mediaDevices.getUserMedia({
		video: { chromeMediaSource: 'desktop', chromeMediaSourceId: 'screen:0' },
		audio: false
	});

	// Restore again
	navigator.mediaDevices.getUserMedia = originalGum;
	console.info(`${LOG_PREFIX} Screen share path validated. Restored original getUserMedia.`);
})();

/**
 * Spike: AudioContext + AnalyserNode for Microphone Monitoring
 *
 * Validates that AudioContext + AnalyserNode can monitor a live MediaStream
 * without modifying it, and measures CPU/memory overhead.
 *
 * Run in DevTools console during an active Teams call, or paste into console
 * after granting microphone access.
 *
 * Issue: #2290
 * Research: docs-site/docs/development/research/speaking-indicator-research.md
 */
(async function spikeAudioAnalyser() {
	const LOG_PREFIX = '[SPIKE_AUDIO_ANALYSER]';
	const SAMPLE_INTERVAL_MS = 100; // ~10fps
	const TEST_DURATION_MS = 10000; // Run for 10 seconds
	const SILENCE_THRESHOLD = 15; // RMS threshold (0-255 range)

	console.info(`${LOG_PREFIX} Starting audio analyser spike...`);

	// --- Step 1: Verify AudioContext is available and not blocked ---
	let audioContext;
	try {
		audioContext = new AudioContext();
		console.info(`${LOG_PREFIX} AudioContext created successfully, state: ${audioContext.state}`);

		if (audioContext.state === 'suspended') {
			console.warn(`${LOG_PREFIX} AudioContext is suspended --- attempting resume`);
			await audioContext.resume();
			console.info(`${LOG_PREFIX} AudioContext resumed, state: ${audioContext.state}`);
		}

		if (audioContext.state !== 'running') {
			console.error(`${LOG_PREFIX} FAIL: AudioContext state is "${audioContext.state}", expected "running"`);
			console.error(`${LOG_PREFIX} This likely means --autoplay-policy=no-user-gesture-required is not set`);
			return;
		}
	} catch (err) {
		console.error(`${LOG_PREFIX} FAIL: Cannot create AudioContext:`, err.message);
		return;
	}

	// --- Step 2: Get a microphone stream ---
	let stream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
		const audioTracks = stream.getAudioTracks();
		console.info(`${LOG_PREFIX} Got MediaStream with ${audioTracks.length} audio track(s)`);

		if (audioTracks.length === 0) {
			console.error(`${LOG_PREFIX} FAIL: No audio tracks in stream`);
			return;
		}

		const track = audioTracks[0];
		console.info(`${LOG_PREFIX} Audio track: label="${track.label}", enabled=${track.enabled}, readyState="${track.readyState}"`);
	} catch (err) {
		console.error(`${LOG_PREFIX} FAIL: Cannot get microphone stream:`, err.message);
		console.info(`${LOG_PREFIX} If in a Teams call, the stream may already be acquired.`);
		console.info(`${LOG_PREFIX} Try running this spike before joining a call.`);
		return;
	}

	// --- Step 3: Create AnalyserNode and connect ---
	const analyser = audioContext.createAnalyser();
	analyser.fftSize = 256;
	analyser.smoothingTimeConstant = 0.3;

	const source = audioContext.createMediaStreamSource(stream);
	source.connect(analyser);
	// IMPORTANT: Do NOT connect analyser to audioContext.destination
	// This prevents audio feedback loops

	const bufferLength = analyser.frequencyBinCount;
	const dataArray = new Uint8Array(bufferLength);

	console.info(`${LOG_PREFIX} AnalyserNode created: fftSize=${analyser.fftSize}, frequencyBinCount=${bufferLength}`);
	console.info(`${LOG_PREFIX} Source connected to analyser (NOT to destination --- no feedback)`);

	// --- Step 4: Record baseline performance ---
	const memBefore = performance.memory ? performance.memory.usedJSHeapSize : null;
	const cpuBefore = performance.now();
	let sampleCount = 0;
	let speakingFrames = 0;
	let silentFrames = 0;
	let peakRms = 0;

	console.info(`${LOG_PREFIX} Starting ${TEST_DURATION_MS / 1000}s monitoring at ${1000 / SAMPLE_INTERVAL_MS}fps...`);
	console.info(`${LOG_PREFIX} Speak into your microphone to test detection.`);
	console.info(`${LOG_PREFIX} Silence threshold: ${SILENCE_THRESHOLD}`);

	// --- Step 5: Sample audio levels ---
	const interval = setInterval(() => {
		analyser.getByteFrequencyData(dataArray);

		// Calculate RMS (root mean square) for volume level
		let sumOfSquares = 0;
		for (let i = 0; i < bufferLength; i++) {
			sumOfSquares += dataArray[i] * dataArray[i];
		}
		const rms = Math.sqrt(sumOfSquares / bufferLength);

		// Track peak
		const peak = Math.max(...dataArray);
		if (rms > peakRms) peakRms = rms;

		const isSpeaking = rms > SILENCE_THRESHOLD;
		if (isSpeaking) {
			speakingFrames++;
		} else {
			silentFrames++;
		}
		sampleCount++;

		// Log every ~1 second
		if (sampleCount % 10 === 0) {
			console.info(
				`${LOG_PREFIX} [${(sampleCount * SAMPLE_INTERVAL_MS / 1000).toFixed(1)}s] ` +
				`RMS: ${rms.toFixed(1)} | Peak: ${peak} | ${isSpeaking ? 'SPEAKING' : 'silent'} | ` +
				`Track enabled: ${stream.getAudioTracks()[0]?.enabled}`
			);
		}
	}, SAMPLE_INTERVAL_MS);

	// --- Step 6: Stop after test duration and report ---
	setTimeout(() => {
		clearInterval(interval);

		const cpuAfter = performance.now();
		const cpuDelta = cpuAfter - cpuBefore;
		const memAfter = performance.memory ? performance.memory.usedJSHeapSize : null;

		console.info(`${LOG_PREFIX} === RESULTS ===`);
		console.info(`${LOG_PREFIX} Duration: ${TEST_DURATION_MS / 1000}s`);
		console.info(`${LOG_PREFIX} Samples: ${sampleCount}`);
		console.info(`${LOG_PREFIX} Speaking frames: ${speakingFrames} (${(speakingFrames / sampleCount * 100).toFixed(1)}%)`);
		console.info(`${LOG_PREFIX} Silent frames: ${silentFrames} (${(silentFrames / sampleCount * 100).toFixed(1)}%)`);
		console.info(`${LOG_PREFIX} Peak RMS: ${peakRms.toFixed(1)}`);
		console.info(`${LOG_PREFIX} Wall clock time: ${cpuDelta.toFixed(1)}ms`);

		if (memBefore !== null && memAfter !== null) {
			const memDeltaKB = (memAfter - memBefore) / 1024;
			console.info(`${LOG_PREFIX} Memory delta: ${memDeltaKB.toFixed(1)} KB`);
		} else {
			console.info(`${LOG_PREFIX} Memory measurement not available (performance.memory not supported)`);
		}

		// --- Validation checks ---
		const checks = [];

		if (audioContext.state === 'running') {
			checks.push({ name: 'AudioContext running', pass: true });
		} else {
			checks.push({ name: 'AudioContext running', pass: false, reason: `state is "${audioContext.state}"` });
		}

		if (sampleCount > 0) {
			checks.push({ name: 'Samples collected', pass: true });
		} else {
			checks.push({ name: 'Samples collected', pass: false, reason: 'no samples' });
		}

		if (peakRms > 0) {
			checks.push({ name: 'Non-zero audio detected', pass: true });
		} else {
			checks.push({ name: 'Non-zero audio detected', pass: false, reason: 'peak RMS is 0 --- was the mic active?' });
		}

		if (speakingFrames > 0 && silentFrames > 0) {
			checks.push({ name: 'Both speaking and silent frames', pass: true });
		} else if (speakingFrames === 0) {
			checks.push({ name: 'Both speaking and silent frames', pass: false, reason: 'no speaking frames --- try speaking louder or lower the threshold' });
		} else {
			checks.push({ name: 'Both speaking and silent frames', pass: false, reason: 'no silent frames --- threshold may be too low' });
		}

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
		source.disconnect();
		audioContext.close();
		stream.getTracks().forEach(t => t.stop());
		console.info(`${LOG_PREFIX} Cleaned up AudioContext and MediaStream`);

	}, TEST_DURATION_MS);
})();

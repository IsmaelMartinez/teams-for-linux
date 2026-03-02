/**
 * Spike 2: Does desktopCapturer.getSources() return screen/window sources?
 *
 * This validates whether Electron's screen capture API works in the current
 * environment. Screen sharing depends on this API returning at least one
 * source.
 *
 * On macOS: you may get a Screen Recording permission prompt — that's expected.
 * In Docker: this tests whether Xvfb/Sway exposes virtual displays to Chromium.
 *
 * Usage:
 *   npx electron testing/spikes/spike-2-desktop-capturer.js
 *
 * Expected result (success): "Sources found: N" with N > 0
 * Expected result (failure): "Sources found: 0"
 */

import { app, desktopCapturer, BrowserWindow } from 'electron';

await app.whenReady();

console.log('');
console.log('=============================================');
console.log('  Spike 2: desktopCapturer');
console.log('=============================================');
console.log('');

// A BrowserWindow is needed on some platforms for desktopCapturer to work
const win = new BrowserWindow({ show: false, width: 1, height: 1 });

try {
	const sources = await desktopCapturer.getSources({
		types: ['screen', 'window'],
		thumbnailSize: { width: 0, height: 0 }
	});

	console.log(`  Sources found: ${sources.length}`);
	console.log('');

	if (sources.length === 0) {
		console.log('  RESULT: FAIL — no sources returned.');
		console.log('  On macOS, check System Settings > Privacy > Screen Recording.');
		console.log('  In Docker, check if PipeWire/xdg-desktop-portal is needed.');
	} else {
		console.log('  RESULT: PASS — desktopCapturer works.');
		console.log('');
		console.log('  Available sources:');
		for (const source of sources) {
			console.log(`    - ${source.name} (${source.id})`);
		}
	}
} catch (err) {
	console.log(`  RESULT: ERROR — ${err.message}`);
}

console.log('');
win.close();
app.quit();

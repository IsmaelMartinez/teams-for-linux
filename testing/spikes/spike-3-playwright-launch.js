/**
 * Spike 3: Can Playwright launch the app with a saved session and confirm
 * it's authenticated?
 *
 * Prerequisites:
 *   - Run spike-1 first and log in so ./testing/spikes/.test-session/ has data
 *   - npm install (playwright must be available)
 *
 * Usage:
 *   node testing/spikes/spike-3-playwright-launch.js
 *
 * Expected result (success): "PASS — app loaded authenticated"
 * Expected result (failure): "FAIL — app redirected to login"
 */

import { _electron as electron } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SESSION_DIR = path.join(__dirname, '.test-session');

const TEAMS_HOSTNAMES = new Set([
	'teams.cloud.microsoft',
	'teams.microsoft.com',
	'teams.live.com',
]);

function classifyWindows(windows) {
	let authenticated = false;
	let onLoginPage = false;

	for (const win of windows) {
		const url = win.url();
		console.log(`  Window URL: ${url}`);

		try {
			const hostname = new URL(url).hostname;
			if (TEAMS_HOSTNAMES.has(hostname)) authenticated = true;
			if (hostname === 'login.microsoftonline.com') onLoginPage = true;
		} catch {
			// Invalid URL, skip
		}
	}

	return { authenticated, onLoginPage };
}

function reportAuthResult({ authenticated, onLoginPage }) {
	if (authenticated) {
		console.log('  RESULT: PASS — app loaded authenticated (Teams hostname detected)');
		console.log('');
		console.log('  Session reuse works with Playwright. The full test approach is viable.');
	} else if (onLoginPage) {
		console.log('  RESULT: FAIL — app redirected to login.microsoftonline.com');
		console.log('');
		console.log('  Session was not preserved. Possible causes:');
		console.log('    - Session expired (re-run spike-1 and log in again)');
		console.log('    - Cookies are tied to the Electron process somehow');
		console.log('    - The session dir does not have the right data');
	} else {
		console.log('  RESULT: UNCLEAR — could not determine auth state');
		console.log('  Check the window URLs above for clues.');
	}
}

async function testDesktopCapturer(electronApp) {
	console.log('');
	console.log('  Bonus: testing desktopCapturer via electronApp.evaluate()...');
	try {
		const sourceCount = await electronApp.evaluate(async ({ desktopCapturer }) => {
			const sources = await desktopCapturer.getSources({
				types: ['screen', 'window'],
				thumbnailSize: { width: 0, height: 0 },
			});
			return sources.length;
		});
		console.log(`  desktopCapturer sources: ${sourceCount}`);
		if (sourceCount > 0) {
			console.log('  desktopCapturer works via Playwright — screen sharing tests are possible.');
		} else {
			console.log('  desktopCapturer returned 0 sources — check screen recording permissions.');
		}
	} catch (err) {
		console.log(`  desktopCapturer error: ${err.message}`);
	}
}

async function closeApp(electronApp) {
	if (!electronApp) return;
	try {
		await Promise.race([
			electronApp.close(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
		]);
	} catch {
		try {
			const pid = electronApp.process()?.pid;
			if (pid) process.kill(pid, 'SIGKILL');
		} catch { /* ignore */ }
	}
}

console.log('');
console.log('=============================================');
console.log('  Spike 3: Playwright + Authenticated Launch');
console.log('=============================================');
console.log('');
console.log(`  Session dir: ${SESSION_DIR}`);
console.log('');

let electronApp;

try {
	console.log('  Launching Electron via Playwright...');
	electronApp = await electron.launch({
		args: [path.join(PROJECT_ROOT, 'app/index.js')],
		env: {
			...process.env,
			E2E_USER_DATA_DIR: SESSION_DIR,
		},
		timeout: 30000,
	});

	console.log('  Waiting for main window...');
	await electronApp.firstWindow({ timeout: 30000 });

	// Give the app time to create all windows and navigate
	await new Promise(resolve => setTimeout(resolve, 8000));

	const windows = electronApp.windows();
	console.log(`  Windows found: ${windows.length}`);

	const result = classifyWindows(windows);
	console.log('');
	reportAuthResult(result);

	await testDesktopCapturer(electronApp);
} catch (err) {
	console.log(`  ERROR: ${err.message}`);
} finally {
	await closeApp(electronApp);
}

console.log('');

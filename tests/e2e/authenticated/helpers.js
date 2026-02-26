const { _electron: electron } = require('playwright');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Launch the Electron app with a persisted session directory.
 * The app should load already authenticated (no login required).
 */
async function launchAuthenticatedApp(sessionDir) {
  const args = [path.join(PROJECT_ROOT, 'app/index.js')];

  if (process.env.CI) {
    args.push('--no-sandbox');
  }

  const electronApp = await electron.launch({
    args,
    env: {
      ...process.env,
      E2E_USER_DATA_DIR: sessionDir,
      NODE_ENV: 'development',
    },
    timeout: 30000,
  });

  return electronApp;
}

/**
 * Wait for the main Teams window (not the toast/notification window).
 * Returns the Page object for the main window.
 */
async function waitForTeamsWindow(electronApp) {
  await electronApp.firstWindow({ timeout: 30000 });

  // Give the app time to create all windows and navigate
  await new Promise(resolve => setTimeout(resolve, 8000));

  const windows = electronApp.windows();

  const teamsHostnames = [
    'teams.cloud.microsoft',
    'teams.microsoft.com',
    'teams.live.com',
  ];

  const mainWindow = windows.find(w => {
    try {
      const hostname = new URL(w.url()).hostname;
      return teamsHostnames.includes(hostname);
    } catch {
      return false;
    }
  });

  return mainWindow || null;
}

/**
 * Gracefully close the Electron app with a timeout fallback.
 */
async function closeApp(electronApp) {
  if (!electronApp) return;

  try {
    await Promise.race([
      electronApp.close(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Close timeout')), 5000)
      ),
    ]);
  } catch {
    try {
      const pid = electronApp.process()?.pid;
      if (pid) process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
}

module.exports = { launchAuthenticatedApp, waitForTeamsWindow, closeApp };

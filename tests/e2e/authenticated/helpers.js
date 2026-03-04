const { _electron: electron } = require('playwright');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Launch the Electron app with a persisted session directory.
 * The app should load already authenticated (no login required).
 */
async function launchAuthenticatedApp(sessionDir) {
  const args = [path.join(PROJECT_ROOT, 'app/index.js')];

  if (process.env.CI && process.env.DOCKER_TEST !== 'true') {
    args.push('--no-sandbox');
  }

  // Docker containers need extra Electron/Chromium flags for headless rendering
  if (process.env.DOCKER_TEST === 'true') {
    args.push(
      '--no-sandbox',
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-dev-shm-usage',
      '--disable-features=SpareRendererForSitePerProcess,BackForwardCache',
      '--renderer-process-limit=1',
      '--js-flags=--max-old-space-size=4096',
      // Match entrypoint.sh: plaintext cookie storage so sessions persist
      // across different D-Bus sessions in Docker
      '--password-store=basic',
    );

    // Wayland needs ozone-platform flag; XWayland uses X11 protocol
    if (process.env.DISPLAY_SERVER === 'wayland') {
      args.push('--ozone-platform=wayland');
    }
  }

  const launchEnv = {
    ...process.env,
    E2E_USER_DATA_DIR: sessionDir,
    E2E_TESTING: 'true',
  };

  // Software rendering in Docker (no GPU)
  if (process.env.DOCKER_TEST === 'true') {
    launchEnv.LIBGL_ALWAYS_SOFTWARE = '1';
    launchEnv.MESA_GL_VERSION_OVERRIDE = '3.3';
  }

  const electronApp = await electron.launch({
    args,
    env: launchEnv,
    timeout: 30000,
  });

  return electronApp;
}

/**
 * Wait for the main Teams window (not the toast/notification window).
 * Returns the Page object for the main window.
 */
async function waitForTeamsWindow(electronApp) {
  const isDocker = process.env.DOCKER_TEST === 'true';
  await electronApp.firstWindow({ timeout: isDocker ? 60000 : 30000 });

  const teamsHostnames = new Set([
    'teams.cloud.microsoft',
    'teams.microsoft.com',
    'teams.live.com',
  ]);

  // Poll for the Teams window instead of a fixed delay. The app may create
  // multiple windows (toast, login redirect) before the main Teams window
  // is ready, so we check repeatedly until it appears or we time out.
  const timeout = isDocker ? 45000 : 22000;
  const pollEnd = Date.now() + timeout;
  while (Date.now() < pollEnd) {
    const windows = electronApp.windows();
    const mainWindow = windows.find(w => {
      try {
        const hostname = new URL(w.url()).hostname;
        return teamsHostnames.has(hostname);
      } catch {
        return false;
      }
    });

    if (mainWindow) {
      return mainWindow;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return null;
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

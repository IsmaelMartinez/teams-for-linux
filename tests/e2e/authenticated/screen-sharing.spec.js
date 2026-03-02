import { test, expect } from '@playwright/test';
import { launchAuthenticatedApp, waitForTeamsWindow, closeApp } from './helpers.js';

test.describe('Screen sharing', () => {
  let electronApp;

  test.afterEach(async () => {
    await closeApp(electronApp);
  });

  // desktopCapturer.getSources() requires an X11 display. On pure Wayland
  // (no XWayland) there is no X display, so the call crashes the Electron
  // main process with "Unable to open display". Skip on pure Wayland.
  test('desktopCapturer returns screen and window sources', async ({}, testInfo) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(process.env.DISPLAY_SERVER === 'wayland',
      'desktopCapturer needs X11 display (unavailable on pure Wayland)');

    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    // With E2E_TESTING=true, the eval override is skipped so
    // electronApp.evaluate() works in the main process context.
    const sources = await electronApp.evaluate(async ({ desktopCapturer }) => {
      const results = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      return results.map(s => ({ id: s.id, name: s.name }));
    });

    expect(sources.length).toBeGreaterThan(0);

    // Should have at least one screen source
    const screenSources = sources.filter(s => s.id.startsWith('screen:'));
    expect(screenSources.length, 'At least one screen source').toBeGreaterThan(0);
  });

  test('app starts without screen sharing errors', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    const screenShareErrors = [];
    mainWindow.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('SCREEN_SHARE')) {
        screenShareErrors.push(msg.text());
      }
    });

    // Teams maintains constant WebSocket activity so networkidle never
    // triggers. Use domcontentloaded instead.
    await mainWindow.waitForLoadState('domcontentloaded', { timeout: 60000 });

    const title = await mainWindow.title();
    expect(title).toBeTruthy();

    expect(screenShareErrors, 'No screen sharing errors in console').toEqual([]);
  });
});

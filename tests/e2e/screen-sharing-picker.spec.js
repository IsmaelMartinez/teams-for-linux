import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * Screen-sharing picker UI tests.
 *
 * Verifies that double-clicking a screen or window tile selects the source
 * and immediately starts sharing through the picker API. The picker is loaded
 * directly in a real browser DOM with mocked display sources and preload API,
 * so these tests do not require Electron, Microsoft authentication, Docker,
 * or real displays.
 */

const PICKER_PATH = path.resolve('app/screenSharing/index.html');
const SCREEN_SOURCE_ID = 'screen:1:0';
const WINDOW_SOURCE_ID = 'window:1';

const displays = [
  {
    id: '1',
    label: 'Primary display',
    internal: true,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    displayFrequency: 60,
  },
];

const sources = [
  {
    id: SCREEN_SOURCE_ID,
    name: 'Primary display',
    display_id: '1',
  },
  {
    id: WINDOW_SOURCE_ID,
    name: 'Test window',
  },
];

async function loadPicker(page) {
  await page.addInitScript(({ configuredDisplays, configuredSources }) => {
    globalThis.__selectedSources = [];
    globalThis.api = {
      getDisplays: async () => configuredDisplays,
      desktopCapturerGetSources: async () => configuredSources,
      selectedSource: (args) => globalThis.__selectedSources.push(args),
      closeView: () => {},
    };
  }, { configuredDisplays: displays, configuredSources: sources });

  await page.goto(pathToFileURL(PICKER_PATH).href);
  await expect(page.locator('#screens-grid .screen-tile')).toHaveCount(1);
}

function selectedSources(page) {
  return page.evaluate(() => globalThis.__selectedSources);
}

test.describe('Screen sharing picker', () => {
  test('shares a screen on double-click', async ({ page }) => {
    await loadPicker(page);

    await page.locator('#screens-grid .screen-tile').dblclick();

    await expect.poll(() => selectedSources(page)).toEqual([
      {
        id: SCREEN_SOURCE_ID,
        screen: { width: 1920, height: 1080, name: '1080p' },
      },
    ]);
  });

  test('shares a window on double-click', async ({ page }) => {
    await loadPicker(page);

    await page.locator('#tab-windows').click();
    const windowTile = page.locator('#windows-grid .window-tile');
    await expect(windowTile).toHaveCount(1);
    await windowTile.dblclick();

    await expect.poll(() => selectedSources(page)).toEqual([
      {
        id: WINDOW_SOURCE_ID,
        screen: { width: 1920, height: 1080, name: '1080p' },
      },
    ]);
  });
});


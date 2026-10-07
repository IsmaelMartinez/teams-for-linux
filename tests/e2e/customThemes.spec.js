import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { closeAndCleanup } from './helpers/electronApp.js';

// Exercise the real config loader, native menu and both CSS injection paths
// without Microsoft login or network access. Every restart is a new Electron
// process, so neither require's JSON cache nor injected styles can mask bugs.
function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'teams-custom-themes-'));
  const themeDirectory = join(directory, 'themes', 'sample');
  mkdirSync(themeDirectory, { recursive: true });
  writeFileSync(join(themeDirectory, 'theme.json'), JSON.stringify({
    id: 'sample', name: 'Sample Theme', css: 'theme.css',
  }));
  writeFileSync(join(themeDirectory, 'theme.css'),
    '.theme-target { background-color: rgb(12, 34, 56) !important; }');
  writeFileSync(join(directory, 'config.json'), JSON.stringify({
    appearance: { followSystemTheme: false },
    window: { closeOnCross: true },
  }));
  writeFileSync(join(directory, 'document.html'), `<!doctype html>
    <html><head><title>Theme regression fixture</title><style>
      .theme-target { background-color: rgb(230, 230, 230); max-width: 17px; }
    </style></head><body>
      <div class="theme-target ts-message-list-container">Theme target</div>
      <iframe srcdoc="<!doctype html><html><head><style>
        .theme-target { background-color: rgb(230, 230, 230); max-width: 17px; }
      </style></head><body><div class='theme-target ts-message-list-container'>Frame target</div></body></html>"></iframe>
    </body></html>`);
  const repository = resolve('.');
  const script = join(directory, 'probe.js');
  writeFileSync(script, `
    const { app, BrowserWindow, Menu } = require('electron');
    const fs = require('node:fs');
    const path = require('node:path');
    const directory = ${JSON.stringify(directory)};
    const repository = ${JSON.stringify(repository)};
    app.setPath('userData', directory);
    app.whenReady().then(async () => {
      const { AppConfiguration } = require(path.join(repository, 'app/appConfiguration'));
      const customCSS = require(path.join(repository, 'app/customCSS'));
      const buildThemeMenu = require(path.join(repository, 'app/menus/themesMenu'));
      const { validateConfigFile } = require(path.join(repository, 'app/config/validator'));
      const options = require(path.join(repository, 'app/config/options'));
      const { version } = require(path.join(repository, 'package.json'));
      const configuration = new AppConfiguration(directory, version);
      const menus = {
        configGroup: configuration,
        selectTheme: (selection) => {
          configuration.setThemeSelection(selection);
          globalThis.__themeProbe.menu = Menu.buildFromTemplate([buildThemeMenu(menus)]);
        },
        openThemesFolder: () => {},
      };
      const menu = Menu.buildFromTemplate([buildThemeMenu(menus)]);
      const window = new BrowserWindow({ show: false });
      await window.loadFile(path.join(directory, 'document.html'));
      customCSS.onDidFinishLoad(window.webContents, configuration.startupConfig, configuration.customCSSPath);
      for (const frame of window.webContents.mainFrame.frames) {
        customCSS.onDidFrameFinishLoad(frame, configuration.startupConfig, configuration.customCSSPath);
      }
      globalThis.__themeProbe = {
        configuration, menu,
        validationWarnings: validateConfigFile(
          JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')), options),
      };
    });
  `);
  return { directory, themeDirectory, script };
}

async function launchProbe(fixture) {
  const electronApp = await electron.launch({
    args: [fixture.script, ...(process.env.CI ? ['--no-sandbox'] : [])],
    timeout: 30000,
  });
  const page = await electronApp.firstWindow();
  await expect.poll(() => electronApp.evaluate(() => Boolean(globalThis.__themeProbe))).toBe(true);
  return { electronApp, page };
}

async function menuState(electronApp) {
  return electronApp.evaluate(() => {
    const serialize = (menu) => menu.items.map((item) => ({
      label: item.label,
      checked: item.checked,
      ...(item.submenu ? { submenu: serialize(item.submenu) } : {}),
    }));
    return {
      items: serialize(globalThis.__themeProbe.menu)[0].submenu,
      cssPath: globalThis.__themeProbe.configuration.customCSSPath,
      selection: globalThis.__themeProbe.configuration.themeSelection,
      validationWarnings: globalThis.__themeProbe.validationWarnings,
    };
  });
}

async function clickTheme(electronApp, group, label) {
  await electronApp.evaluate((_electron, { group, label }) => {
    let menu = globalThis.__themeProbe.menu.items[0].submenu;
    if (group) menu = menu.items.find((item) => item.label === group).submenu;
    const item = menu.items.find((item) => item.label === label);
    if (!item) throw new Error('Requested theme menu entry is missing');
    item.click();
  }, { group, label });
}

async function expectColors(page, expected) {
  await expect(page.locator('.theme-target')).toHaveCSS('background-color', expected);
  await expect(page.frameLocator('iframe').locator('.theme-target')).toHaveCSS('background-color', expected);
}

function checkedLabels(state) {
  return state.items.flatMap((item) =>
    (item.submenu ?? [item]).filter((entry) => entry.checked).map((entry) => entry.label));
}

test('native theme selection persists, injects CSS, and falls back safely after deletion', async () => {
  test.setTimeout(90000);
  const fixture = createFixture();
  let context;
  try {
    context = await launchProbe(fixture);
    let state = await menuState(context.electronApp);
    expect(state.validationWarnings).toEqual([]);
    expect(state.items.find((item) => item.label === 'Default').checked).toBe(true);
    expect(checkedLabels(state)).toEqual(['Default']);
    expect(state.items.find((item) => item.label === 'Built-in').submenu.map((item) => item.label))
      .toEqual(['Compact Dark', 'Compact Light', 'Tweaks', 'Condensed Dark', 'Condensed Light']);
    expect(state.items.find((item) => item.label === 'Custom').submenu.map((item) => item.label))
      .toEqual(['Sample Theme']);

    await clickTheme(context.electronApp, 'Custom', 'Sample Theme');
    const readConfig = () => JSON.parse(readFileSync(join(fixture.directory, 'config.json'), 'utf8'));
    expect(readConfig()).toMatchObject({
      appearance: { cssName: 'custom:sample', followSystemTheme: false },
      window: { closeOnCross: true },
    });
    // Applying CSS is restart-only: saving leaves the running document alone.
    await expectColors(context.page, 'rgb(230, 230, 230)');
    await closeAndCleanup(context);

    context = await launchProbe(fixture);
    state = await menuState(context.electronApp);
    expect(state.selection.cssName).toBe('custom:sample');
    expect(state.validationWarnings).toEqual([]);
    expect(state.items.find((item) => item.label === 'Custom').submenu[0].checked).toBe(true);
    expect(checkedLabels(state)).toEqual(['Sample Theme']);
    expect(state.cssPath).toBe(join(fixture.themeDirectory, 'theme.css'));
    await expectColors(context.page, 'rgb(12, 34, 56)');

    await clickTheme(context.electronApp, 'Built-in', 'Compact Dark');
    expect(readConfig().appearance.cssName).toBe('compactDark');
    await closeAndCleanup(context);

    context = await launchProbe(fixture);
    state = await menuState(context.electronApp);
    expect(state.validationWarnings).toEqual([]);
    expect(state.selection.cssName).toBe('compactDark');
    expect(checkedLabels(state)).toEqual(['Compact Dark']);
    expect(state.cssPath).toBe(resolve('app/assets/css/compactDark.css'));
    await expectColors(context.page, 'rgb(230, 230, 230)');
    // This stable packaged rule proves the built-in was actually injected.
    await expect(context.page.locator('.theme-target')).toHaveCSS('max-width', '100%');
    await expect(context.page.frameLocator('iframe').locator('.theme-target')).toHaveCSS('max-width', '100%');

    await clickTheme(context.electronApp, 'Custom', 'Sample Theme');
    await closeAndCleanup(context);
    rmSync(fixture.themeDirectory, { recursive: true });

    context = await launchProbe(fixture);
    state = await menuState(context.electronApp);
    expect(state.validationWarnings).toEqual([]);
    expect(state.cssPath).toBeNull();
    expect(state.selection.cssName).toBe('custom:sample');
    expect(readConfig().appearance.cssName).toBe('custom:sample');
    expect(state.items.find((item) => item.label === 'Default').checked).toBe(true);
    expect(checkedLabels(state)).toEqual(['Default']);
    expect(state.items.find((item) => item.label === 'Custom')).toBeUndefined();
    await expectColors(context.page, 'rgb(230, 230, 230)');
    await expect(context.page.locator('.theme-target')).toHaveCSS('max-width', '17px');
  } finally {
    await closeAndCleanup({ ...context, userDataDir: fixture.directory });
  }
});

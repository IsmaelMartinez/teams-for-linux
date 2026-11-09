import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

/**
 * Custom toast layout (notifications.method: "custom").
 *
 * Unit tests have no DOM, so they can only check the toast page's source.
 * This spec renders real toasts through NotificationToast in hidden windows
 * and checks what the page does with the customNotification options: how
 * many body lines fit at different heights and font sizes, and that colours
 * are validated before they are applied.
 */

const CASES = [
  { id: 'default', options: {} },
  { id: 'tall', options: { width: 440, height: 220 } },
  { id: 'tall-big-font', options: { width: 440, height: 220, bodyFontSize: 20 } },
  { id: 'purple', options: { backgroundColor: '#5B5FC7' } },
  { id: 'invalid-colour', options: { backgroundColor: 'not-a-colour' } },
];

// Runs in each toast page once its init message has arrived.
function measureToast() {
  const body = document.getElementById('body');
  const style = getComputedStyle(body);
  const lineHeight = Number.parseFloat(style.lineHeight);
  return {
    id: document.getElementById('title').innerText,
    clamp: Number(body.style.webkitLineClamp || style.webkitLineClamp),
    lines: Math.round(body.getBoundingClientRect().height / lineHeight),
    fontSize: style.fontSize,
    background: getComputedStyle(document.body).backgroundColor,
  };
}

test.describe('Custom toast layout', () => {
  let electronApp;
  const results = {};

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [
        './tests/e2e/helpers/toastLayoutMain.cjs',
        ...(process.env.CI ? ['--no-sandbox'] : []),
      ],
      env: { ...process.env, TOAST_CASES: JSON.stringify(CASES) },
      timeout: 30000,
    });

    const deadline = Date.now() + 20000;
    while (Object.keys(results).length < CASES.length && Date.now() < deadline) {
      for (const page of electronApp.windows()) {
        if (!page.url().endsWith('notificationToast.html')) continue;
        const ready = await page.evaluate(() => document.getElementById('title').innerText !== '');
        if (ready) {
          const result = await page.evaluate(measureToast);
          results[result.id] = result;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('renders every case', () => {
    expect(Object.keys(results).sort()).toEqual(CASES.map((c) => c.id).sort());
  });

  test('default toast keeps the original two-line body and grey background', () => {
    expect(results.default.clamp).toBe(2);
    expect(results.default.lines).toBe(2);
    expect(results.default.fontSize).toBe('13px');
    expect(results.default.background).toBe('rgb(45, 45, 45)');
  });

  test('a taller toast shows more body lines, filling the space', () => {
    expect(results.tall.lines).toBeGreaterThan(2);
    expect(results.tall.lines).toBe(results.tall.clamp);
  });

  test('a larger body font fits fewer lines in the same toast', () => {
    expect(results['tall-big-font'].fontSize).toBe('20px');
    expect(results['tall-big-font'].lines).toBeGreaterThanOrEqual(2);
    expect(results['tall-big-font'].lines).toBeLessThan(results.tall.lines);
    expect(results['tall-big-font'].lines).toBe(results['tall-big-font'].clamp);
  });

  test('a valid colour is applied and an invalid one keeps the default', () => {
    expect(results.purple.background).toBe('rgb(91, 95, 199)');
    expect(results['invalid-colour'].background).toBe('rgb(45, 45, 45)');
  });
});

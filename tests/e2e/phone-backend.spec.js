import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(`${process.cwd()}/package.json`);
const scenarios = [
  ['relay', 'main, direct and nested frames preserve credentials, short timeouts and aborts'],
  ['prompt', 'QR dialogs respect the system theme, restrictive CSP and cancellation'],
  ['lifecycle', 'navigation and renderer loss terminate pending assertions'],
];

for (const [scenario, description] of scenarios) {
  test(`phone backend: ${description}`, async () => {
    test.skip(process.platform !== 'linux', 'Phone backend is Linux-only');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'teams-phone-test-'));
    const child = spawn(require('electron'), [
      'tests/e2e/fixtures/phone-smoke.cjs',
      ...(process.env.CI ? ['--no-sandbox'] : []),
    ], {
      env: { ...process.env, TEAMS_PHONE_TEST_PROFILE: profile, TEAMS_PHONE_TEST_SCENARIO: scenario },
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 25000);
    try {
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      expect(code, output).toBe(0);
      expect(output).toContain(`PASS: phone ${scenario}`);
    } finally {
      clearTimeout(timeout);
      child.kill();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
}

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const launcher = require('../../app/concurrentAccounts/launcher');

describe('concurrent accounts launcher', () => {
  it('uses the AppImage path when present and skips the unpackaged app path', () => {
    const plan = launcher.buildLaunchPlan({
      isPackaged: true,
      execPath: '/usr/lib/teams-for-linux/teams-for-linux',
      appPath: '/usr/lib/teams-for-linux/resources/app.asar',
      appImage: '/opt/Teams-for-Linux.AppImage',
      userDataDir: '/tmp/account-a',
      wmClass: 'teams-for-linux-work',
      appTitle: 'Microsoft Teams — Work',
    });
    assert.strictEqual(plan.command, '/opt/Teams-for-Linux.AppImage');
    assert.deepStrictEqual(plan.args, [
      '--user-data-dir=/tmp/account-a',
      '--class=teams-for-linux-work',
      '--appTitle=Microsoft Teams — Work',
    ]);
  });

  it('prefixes the app path when unpackaged', () => {
    const plan = launcher.buildLaunchPlan({
      isPackaged: false,
      execPath: '/usr/bin/electron',
      appPath: '/src/teams-for-linux/app',
      appImage: undefined,
      userDataDir: '/tmp/account-b',
      wmClass: 'teams-for-linux-personal',
      appTitle: 'Microsoft Teams — Personal',
    });
    assert.strictEqual(plan.command, '/usr/bin/electron');
    assert.strictEqual(plan.args[0], '/src/teams-for-linux/app');
    assert.ok(plan.args.includes('--user-data-dir=/tmp/account-b'));
  });

  it('skips auto-launch in e2e and when the child env flag is set', () => {
    assert.strictEqual(
      launcher.shouldSkipAutoLaunch({ E2E_USER_DATA_DIR: '/tmp/e2e' }),
      true
    );
    assert.strictEqual(
      launcher.shouldSkipAutoLaunch({
        [launcher.SKIP_AUTO_LAUNCH_ENV]: '1',
      }),
      true
    );
    assert.strictEqual(launcher.shouldSkipAutoLaunch({}), false);
  });
});

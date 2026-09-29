'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbusPath = require.resolve('@homebridge/dbus-native');
const modulePath = require.resolve('../../app/menus/themeIcon');

describe('themeIcon', { skip: process.platform !== 'linux' }, () => {
  let tmp;
  let signals;
  const env = { ...process.env };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-icon-'));
    signals = [];
    process.env.XDG_DATA_HOME = tmp;
    process.env.XDG_DATA_DIRS = path.join(tmp, 'none');
    delete process.env.SNAP;
    delete process.env.FLATPAK_ID;
    delete process.env.APPIMAGE;
    require.cache[dbusPath] = {
      id: dbusPath,
      filename: dbusPath,
      loaded: true,
      exports: { sessionBus: () => ({ sendSignal: (...args) => signals.push(args) }) },
    };
    delete require.cache[modulePath];
  });

  afterEach(() => {
    delete require.cache[dbusPath];
    delete require.cache[modulePath];
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, env);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const fakeImage = (width, height) => ({
    getSize: () => ({ width, height }),
    resize: (opts) => ({ toPNG: () => Buffer.from(JSON.stringify(opts)) }),
  });

  it('writes every hicolor size, keeping the aspect on the longer side, then removes them', () => {
    const themeIcon = require(modulePath);
    assert.strictEqual(themeIcon.install(fakeImage(250, 264)), true);
    const dir = path.join(tmp, 'icons', 'hicolor');
    const written = fs.readdirSync(dir).sort();
    assert.strictEqual(written.length, 10);
    const png = fs.readFileSync(path.join(dir, '48x48', 'apps', 'teams-for-linux.png'), 'utf8');
    assert.deepStrictEqual(JSON.parse(png), { height: 48 });
    assert.deepStrictEqual(signals[0], ['/KIconLoader', 'org.kde.KIconLoader', 'iconChanged', 'i', [0]]);

    assert.strictEqual(themeIcon.remove(), true);
    assert.ok(!fs.existsSync(path.join(dir, '48x48', 'apps', 'teams-for-linux.png')));
  });

  it('takes the icon name from the desktop file that launches this binary', () => {
    const apps = path.join(tmp, 'applications');
    fs.mkdirSync(apps, { recursive: true });
    fs.writeFileSync(path.join(apps, 'other.desktop'), 'Exec=/bin/other\nIcon=other\n');
    fs.writeFileSync(
      path.join(apps, 'appimagekit_x-teams.desktop'),
      `Exec=${process.execPath} %U\nIcon=appimagekit_x_teams-for-linux\n`,
    );
    assert.strictEqual(require(modulePath).iconName(), 'appimagekit_x_teams-for-linux');
  });

  it('does nothing inside a snap or flatpak', () => {
    process.env.FLATPAK_ID = 'com.example.Teams';
    const themeIcon = require(modulePath);
    assert.strictEqual(themeIcon.install(fakeImage(64, 64)), false);
    assert.ok(!fs.existsSync(path.join(tmp, 'icons')));
  });
});

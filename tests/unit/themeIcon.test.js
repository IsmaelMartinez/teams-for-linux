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
  const argv = [...process.argv];

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
    process.argv = [...argv];
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const fakeImage = (width, height) => ({
    getSize: () => ({ width, height }),
    resize: (opts) => ({ toPNG: () => Buffer.from(JSON.stringify(opts)) }),
  });
  const iconPath = (size, name = 'teams-for-linux') =>
    path.join(tmp, 'icons', 'hicolor', `${size}x${size}`, 'apps', `${name}.png`);
  const writeDesktop = (file, text) => {
    const apps = path.join(tmp, 'applications');
    fs.mkdirSync(apps, { recursive: true });
    fs.writeFileSync(path.join(apps, file), text);
  };

  it('writes every hicolor size, keeping the aspect on the longer side, then removes them', () => {
    const themeIcon = require(modulePath);
    assert.strictEqual(themeIcon.install(fakeImage(250, 264)), true);
    assert.strictEqual(fs.readdirSync(path.join(tmp, 'icons', 'hicolor')).length, 10);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(iconPath(48), 'utf8')), { height: 48 });
    assert.deepStrictEqual(signals[0], ['/KIconLoader', 'org.kde.KIconLoader', 'iconChanged', 'i', [0]]);

    assert.strictEqual(themeIcon.remove(), true);
    assert.ok(!fs.existsSync(iconPath(48)));
  });

  it('removes only the files it wrote itself', () => {
    const themeIcon = require(modulePath);
    fs.mkdirSync(path.dirname(iconPath(1024)), { recursive: true });
    fs.writeFileSync(iconPath(1024), 'hand placed');
    assert.strictEqual(themeIcon.remove(), false);
    assert.ok(fs.existsSync(iconPath(1024)));

    themeIcon.install(fakeImage(64, 64));
    themeIcon.remove();
    assert.ok(fs.existsSync(iconPath(1024)));
    assert.ok(!fs.existsSync(iconPath(64)));
  });

  it('rolls back and reports failure when the theme directory is not writable', () => {
    const themeIcon = require(modulePath);
    fs.mkdirSync(path.dirname(iconPath(24)), { recursive: true });
    fs.mkdirSync(iconPath(24));
    assert.strictEqual(themeIcon.install(fakeImage(64, 64)), false);
    assert.ok(!fs.existsSync(iconPath(16)));
    assert.strictEqual(signals.length, 0);
  });

  it('prefers the profile launcher, then the packaged entry, then the binary match', () => {
    writeDesktop('other.desktop', `Exec=${process.execPath} %U\nIcon=other\n`);
    assert.strictEqual(require(modulePath).iconName(), 'other');

    writeDesktop('teams-for-linux.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux\nIcon=teams-for-linux\n');
    delete require.cache[modulePath];
    assert.strictEqual(require(modulePath).iconName(), 'teams-for-linux');

    writeDesktop('work.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux --class=teams-work\nIcon=teams-work\nStartupWMClass=teams-work\n');
    process.argv.push('--class=teams-work');
    delete require.cache[modulePath];
    assert.strictEqual(require(modulePath).iconName(), 'teams-work');
  });

  it('falls back to the default name when the desktop file icon is not a plain name', () => {
    for (const icon of ['../../escape', '/usr/share/pixmaps/x.png', 'a b']) {
      writeDesktop('teams-for-linux.desktop', `Icon=${icon}\n`);
      delete require.cache[modulePath];
      assert.strictEqual(require(modulePath).iconName(), 'teams-for-linux');
    }
  });

  it('does nothing inside a snap or flatpak', () => {
    process.env.FLATPAK_ID = 'com.example.Teams';
    const themeIcon = require(modulePath);
    assert.strictEqual(themeIcon.install(fakeImage(64, 64)), false);
    assert.ok(!fs.existsSync(path.join(tmp, 'icons')));
  });
});

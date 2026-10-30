'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const dbusPath = require.resolve('@homebridge/dbus-native');
const modulePath = require.resolve('../../app/menus/themeIcon');

describe('themeIcon', { skip: process.platform !== 'linux' }, () => {
  let tmp;
  let signals;
  let buses;
  const env = { ...process.env };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-icon-'));
    signals = [];
    buses = [];
    process.env.XDG_DATA_HOME = tmp;
    process.env.XDG_DATA_DIRS = path.join(tmp, 'none');
    delete process.env.SNAP;
    delete process.env.FLATPAK_ID;
    delete process.env.APPIMAGE;
    require.cache[dbusPath] = {
      id: dbusPath,
      filename: dbusPath,
      loaded: true,
      exports: {
        sessionBus: () => {
          const bus = { connection: new EventEmitter(), sendSignal: (...args) => signals.push(args) };
          buses.push(bus);
          return bus;
        },
      },
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

  const fakeImage = (width, height, tag = '') => ({
    getSize: () => ({ width, height }),
    resize: (opts) => ({ toPNG: () => Buffer.from(JSON.stringify({ ...opts, tag })) }),
  });
  const iconPath = (size, name = 'teams-for-linux') =>
    path.join(tmp, 'icons', 'hicolor', `${size}x${size}`, 'apps', `${name}.png`);
  const readIcon = (size, name) => JSON.parse(fs.readFileSync(iconPath(size, name), 'utf8'));
  const manifest = () => JSON.parse(fs.readFileSync(path.join(tmp, 'teams-for-linux', 'theme-icon.json'), 'utf8'));
  const writeDesktop = (file, text) => {
    const apps = path.join(tmp, 'applications');
    fs.mkdirSync(apps, { recursive: true });
    fs.writeFileSync(path.join(apps, file), text);
  };

  it('writes every hicolor size, keeping the aspect on the longer side, then removes them', () => {
    const themeIcon = require(modulePath);
    assert.strictEqual(themeIcon.installed(), false);
    assert.strictEqual(themeIcon.install(fakeImage(250, 264)), true);
    assert.strictEqual(fs.readdirSync(path.join(tmp, 'icons', 'hicolor')).length, 10);
    assert.deepStrictEqual(readIcon(48), { height: 48, tag: '' });
    assert.ok(!fs.existsSync(`${iconPath(48)}.tmp-${process.pid}`));
    assert.strictEqual(themeIcon.installed(), true);
    assert.deepStrictEqual(signals[0], ['/KIconLoader', 'org.kde.KIconLoader', 'iconChanged', 'i', [0]]);

    assert.strictEqual(themeIcon.remove(), true);
    assert.ok(!fs.existsSync(iconPath(48)));
    assert.strictEqual(themeIcon.installed(), false);
    assert.ok(!fs.existsSync(path.join(tmp, 'teams-for-linux', 'theme-icon.json')));
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

  it('never overwrites a hand-placed icon at one of its sizes', () => {
    const themeIcon = require(modulePath);
    fs.mkdirSync(path.dirname(iconPath(48)), { recursive: true });
    fs.writeFileSync(iconPath(48), 'hand placed');

    assert.strictEqual(themeIcon.install(fakeImage(64, 64, 'first')), true);
    assert.strictEqual(themeIcon.install(fakeImage(64, 64, 'second')), true);
    assert.strictEqual(fs.readFileSync(iconPath(48), 'utf8'), 'hand placed');
    assert.strictEqual(readIcon(64).tag, 'second');
    assert.strictEqual(manifest()['teams-for-linux'].length, 9);

    themeIcon.remove();
    assert.strictEqual(fs.readFileSync(iconPath(48), 'utf8'), 'hand placed');
    assert.ok(!fs.existsSync(iconPath(64)));
  });

  it('survives a failed session bus connection and reconnects on the next change', () => {
    const themeIcon = require(modulePath);
    themeIcon.install(fakeImage(64, 64));
    assert.strictEqual(buses.length, 1);
    assert.doesNotThrow(() => buses[0].connection.emit('error', new Error('connect ENOENT')));

    themeIcon.remove();
    assert.strictEqual(buses.length, 2);
    assert.strictEqual(signals.length, 2);
  });

  it('keeps the previous icon set whole when a replacement fails partway', () => {
    const themeIcon = require(modulePath);
    assert.strictEqual(themeIcon.install(fakeImage(64, 64, 'first')), true);
    fs.mkdirSync(`${iconPath(96)}.tmp-${process.pid}`);
    signals = [];

    assert.strictEqual(themeIcon.install(fakeImage(64, 64, 'second')), false);
    for (const size of [16, 48, 64, 512]) assert.strictEqual(readIcon(size).tag, 'first');
    assert.ok(!fs.existsSync(`${iconPath(16)}.tmp-${process.pid}`));
    assert.strictEqual(manifest()['teams-for-linux'].length, 10);
    assert.strictEqual(signals.length, 0);
  });

  it('keeps one manifest entry per icon name so profiles do not clobber each other', () => {
    writeDesktop('teams-for-linux.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux\nIcon=teams-for-linux\n');
    writeDesktop('work.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux --class teams-work\nIcon=teams-work\nStartupWMClass=teams-work\n');
    const themeIcon = require(modulePath);
    const work = { windowClass: 'teams-work' };

    themeIcon.install(fakeImage(64, 64, 'default'));
    themeIcon.install(fakeImage(64, 64, 'work'), work);
    assert.deepStrictEqual(Object.keys(manifest()).sort(), ['teams-for-linux', 'teams-work']);
    assert.strictEqual(readIcon(32, 'teams-work').tag, 'work');

    assert.strictEqual(themeIcon.remove(work), true);
    assert.ok(!fs.existsSync(iconPath(32, 'teams-work')));
    assert.strictEqual(readIcon(32).tag, 'default');
    assert.strictEqual(themeIcon.installed(), true);
    assert.strictEqual(themeIcon.installed(work), false);
  });

  it('prefers the launcher for the window class, then the packaged entry, then the binary match', () => {
    writeDesktop('other.desktop', `Exec=${process.execPath} %U\nIcon=other\n`);
    assert.strictEqual(require(modulePath).iconName(), 'other');

    writeDesktop('teams-for-linux.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux\nIcon=teams-for-linux\n');
    delete require.cache[modulePath];
    assert.strictEqual(require(modulePath).iconName(), 'teams-for-linux');

    writeDesktop('work.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux --class teams-work\nIcon=teams-work\nStartupWMClass=teams-work\n');
    delete require.cache[modulePath];
    assert.strictEqual(require(modulePath).iconName({ windowClass: 'teams-work' }), 'teams-work');
    assert.strictEqual(require(modulePath).iconName({ windowClass: null }), 'teams-for-linux');
  });

  it('matches the whole window class, not a launcher whose class only starts with it', () => {
    writeDesktop('extra.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux --class teams-work-extra\nIcon=teams-extra\nStartupWMClass=teams-work-extra\n');
    writeDesktop('work.desktop', 'Exec=/opt/teams-for-linux/teams-for-linux --class teams-work\nIcon=teams-work\nStartupWMClass=teams-work\n');
    const { iconName } = require(modulePath);
    assert.strictEqual(iconName({ windowClass: 'teams-work' }), 'teams-work');
    assert.strictEqual(iconName({ windowClass: 'teams-work-extra' }), 'teams-extra');
    assert.strictEqual(iconName({ windowClass: 'teams' }), 'teams-for-linux');
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
    assert.strictEqual(themeIcon.supported(), false);
    assert.strictEqual(themeIcon.install(fakeImage(64, 64)), false);
    assert.strictEqual(themeIcon.installed(), false);
    assert.ok(!fs.existsSync(path.join(tmp, 'icons')));
  });
});

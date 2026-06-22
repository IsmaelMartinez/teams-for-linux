'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const commandLinePath = require.resolve('../../app/startup/commandLine');

const originalElectron = require.cache[electronPath];
const originalPlatform = process.platform;
const originalArch = process.arch;

// Run CommandLineManager.addSwitchesAfterConfigLoad under a mocked Electron
// `app.commandLine`, forced platform and arch, returning the list of switches
// the manager appended as [name, value] pairs.
function appendedSwitches(config, platform = 'darwin', arch = 'arm64') {
  const switches = [];
  const app = {
    commandLine: {
      appendSwitch: (name, value) => switches.push([name, value]),
      hasSwitch: () => false,
      getSwitchValue: () => '',
    },
    setName: () => {},
    setDesktopName: () => {},
    disableHardwareAcceleration: () => {},
  };

  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { app },
  };
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });
  delete require.cache[commandLinePath];

  const CommandLineManager = require(commandLinePath);
  CommandLineManager.addSwitchesAfterConfigLoad(config);
  return switches;
}

function hasSwitch(switches, name) {
  return switches.some(([n]) => n === name);
}

function switchValue(switches, name) {
  const found = switches.find(([n]) => n === name);
  return found ? found[1] : undefined;
}

describe('CommandLineManager macOS performance gate', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
    if (originalElectron) {
      require.cache[electronPath] = originalElectron;
    } else {
      delete require.cache[electronPath];
    }
    delete require.cache[commandLinePath];
  });

  it('applies the Metal/GPU switches on macOS by default', () => {
    const switches = appendedSwitches({ authServerWhitelist: '*' });
    assert.deepStrictEqual(
      switches.find(([n]) => n === 'use-angle'),
      ['use-angle', 'metal'],
      'forces ANGLE Metal by default',
    );
    assert.ok(hasSwitch(switches, 'enable-gpu-rasterization'));
    assert.ok(hasSwitch(switches, 'enable-webrtc-hw-encoding'));
  });

  it('applies the larger V8 heap only on arm64', () => {
    const arm = switchValue(appendedSwitches({ authServerWhitelist: '*' }, 'darwin', 'arm64'), 'js-flags');
    assert.match(arm, /--max-old-space-size=4096/, 'arm64 gets the larger heap');
    assert.match(arm, /--concurrent-marking/, 'arm64 still gets the concurrency flags');

    const intel = switchValue(appendedSwitches({ authServerWhitelist: '*' }, 'darwin', 'x64'), 'js-flags');
    assert.doesNotMatch(intel, /--max-old-space-size/, 'Intel does not get the larger heap');
    assert.doesNotMatch(intel, /--max-semi-space-size/, 'Intel does not get the semi-space bump');
    assert.match(intel, /--concurrent-marking/, 'Intel still gets the concurrency flags');
  });

  it('skips the switches when media.macPerformanceMode is false', () => {
    const switches = appendedSwitches({
      authServerWhitelist: '*',
      media: { macPerformanceMode: false },
    });
    assert.ok(!hasSwitch(switches, 'use-angle'), 'no ANGLE Metal switch');
    assert.ok(!hasSwitch(switches, 'enable-gpu-rasterization'), 'no rasterization switch');
    assert.ok(!hasSwitch(switches, 'enable-webrtc-hw-encoding'), 'no HW WebRTC switch');
  });

  it('still applies the switches when media.macPerformanceMode is explicitly true', () => {
    const switches = appendedSwitches({
      authServerWhitelist: '*',
      media: { macPerformanceMode: true },
    });
    assert.ok(hasSwitch(switches, 'use-angle'));
  });

  it('disableGpu short-circuits the perf switches even with the flag on', () => {
    const switches = appendedSwitches({
      authServerWhitelist: '*',
      disableGpu: true,
      media: { macPerformanceMode: true },
    });
    assert.ok(!hasSwitch(switches, 'use-angle'), 'perf switches suppressed when GPU is disabled');
    assert.ok(hasSwitch(switches, 'disable-gpu'), 'disable-gpu still applied');
  });

  it('does not apply the macOS switches on non-darwin platforms', () => {
    const switches = appendedSwitches({ authServerWhitelist: '*' }, 'linux');
    assert.ok(!hasSwitch(switches, 'use-angle'), 'mac perf path not taken off macOS');
  });
});

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const commandLinePath = require.resolve('../../app/startup/commandLine');

const originalElectron = require.cache[electronPath];
const originalPlatform = process.platform;

// Run CommandLineManager.addSwitchesAfterConfigLoad under a mocked Electron
// `app.commandLine` and a forced platform, returning the list of switches the
// manager appended as [name, value] pairs.
function appendedSwitches(config, platform = 'darwin') {
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
  delete require.cache[commandLinePath];

  const CommandLineManager = require(commandLinePath);
  CommandLineManager.addSwitchesAfterConfigLoad(config);
  return switches;
}

function hasSwitch(switches, name) {
  return switches.some(([n]) => n === name);
}

describe('CommandLineManager macOS performance gate', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
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

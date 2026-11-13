'use strict';

// A fake renderer environment for the canvas-drawing browser tools
// (trayIconRenderer.js, windowIconRenderer.js). Unit tests have no DOM, so
// this stubs Electron's nativeImage, document.createElement, Image and
// globalThis.addEventListener, and pins process.platform to Linux.
//
// Call it in beforeEach and the returned restore() in afterEach.
//
// - createFromPath(path): the fake nativeImage.createFromPath.
// - createCanvas(): returns the fake canvas element for createElement('canvas').
// - getListeners(): returns the Map the renderer's addEventListener calls go
//   into. It is read on each call, so a test may swap the Map.
// - rendererPath: the module to drop from the require cache on restore.
function installFakeRendererEnv({ createFromPath, createCanvas, getListeners, rendererPath }) {
  const electronPath = require.resolve('electron');
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { nativeImage: { createFromPath } },
  };
  globalThis.document = { createElement: (tag) => (tag === 'canvas' ? createCanvas() : {}) };
  globalThis.Image = class {
    set src(_value) {
      setImmediate(() => this.onload?.());
    }
  };
  globalThis.addEventListener = (event, listener) => {
    const listeners = getListeners();
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(listener);
  };
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const setPlatform = (value) => Object.defineProperty(process, 'platform', { ...platform, value });
  setPlatform('linux');

  return {
    setPlatform,
    restore() {
      Object.defineProperty(process, 'platform', platform);
      delete require.cache[electronPath];
      delete require.cache[rendererPath];
      delete globalThis.document;
      delete globalThis.Image;
      delete globalThis.addEventListener;
    },
  };
}

module.exports = { installFakeRendererEnv };

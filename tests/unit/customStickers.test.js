'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Stub the electron module before requiring the SUT — unit tests run in plain
// Node, so ipcMain/etc. are not available unless mocked.
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: { ipcMain: { handle: () => {} } },
};
const CustomStickers = require('../../app/customStickers/index.js');

// 1x1 transparent PNG (minimal valid PNG bytes).
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6300010000000500010d0a2db40000000049454e44ae426082',
  'hex',
);

function makeApp(userDataPath) {
  return { getPath: () => userDataPath };
}

describe('CustomStickers handleGetStickerList', () => {
  let tmpRoot;
  let stickerFolder;
  let module;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tfl-customstickers-'));
    stickerFolder = path.join(tmpRoot, 'stickers');
    fs.mkdirSync(stickerFolder);

    // Top-level stickers
    fs.writeFileSync(path.join(stickerFolder, 'top.png'), PNG_BYTES);
    fs.writeFileSync(path.join(stickerFolder, 'cover.webp'), PNG_BYTES);
    // Top-level non-image file (must be ignored)
    fs.writeFileSync(path.join(stickerFolder, 'README.txt'), 'ignore me');

    // Subfolder one — simulated Telegram pack
    const packA = path.join(stickerFolder, 'pack-a');
    fs.mkdirSync(packA);
    fs.writeFileSync(path.join(packA, 'a1.png'), PNG_BYTES);
    fs.writeFileSync(path.join(packA, 'a2.png'), PNG_BYTES);

    // Subfolder two — simulated AI subfolder with a webp
    const aiFolder = path.join(stickerFolder, 'ai');
    fs.mkdirSync(aiFolder);
    fs.writeFileSync(path.join(aiFolder, 'gen-1.webp'), PNG_BYTES);

    // Nested deeper level — must NOT be scanned
    const deeper = path.join(packA, 'deeper');
    fs.mkdirSync(deeper);
    fs.writeFileSync(path.join(deeper, 'hidden.png'), PNG_BYTES);

    const config = {
      customStickers: {
        enabled: true,
        folder: stickerFolder,
        formats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      },
    };
    module = new CustomStickers(makeApp(tmpRoot), config);
    module.initialize();
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns stickers from the top level with subfolder=""', () => {
    const result = module.handleGetStickerList();
    const topLevel = result.stickers.filter((s) => s.subfolder === '');
    const names = topLevel.map((s) => s.name).sort();
    assert.deepStrictEqual(names, ['cover.webp', 'top.png']);
  });

  it('recurses exactly one level into subdirectories', () => {
    const result = module.handleGetStickerList();
    const packA = result.stickers.filter((s) => s.subfolder === 'pack-a');
    const ai = result.stickers.filter((s) => s.subfolder === 'ai');
    assert.deepStrictEqual(packA.map((s) => s.name).sort(), ['a1.png', 'a2.png']);
    assert.deepStrictEqual(ai.map((s) => s.name), ['gen-1.webp']);
  });

  it('does not recurse beyond one level', () => {
    const result = module.handleGetStickerList();
    const hidden = result.stickers.find((s) => s.name === 'hidden.png');
    assert.strictEqual(hidden, undefined, 'depth-2 stickers must not appear');
  });

  it('ignores non-image files', () => {
    const result = module.handleGetStickerList();
    const txt = result.stickers.find((s) => s.name === 'README.txt');
    assert.strictEqual(txt, undefined);
  });

  it('produces data URLs that match the file extension mime type', () => {
    const result = module.handleGetStickerList();
    const png = result.stickers.find((s) => s.name === 'top.png');
    const webp = result.stickers.find((s) => s.name === 'cover.webp');
    assert.ok(png.dataUrl.startsWith('data:image/png;base64,'));
    assert.ok(webp.dataUrl.startsWith('data:image/webp;base64,'));
    assert.strictEqual(png.mimeType, 'image/png');
    assert.strictEqual(webp.mimeType, 'image/webp');
  });
});

describe('CustomStickers getAllowedFormats fallback', () => {
  it('returns the default set including webp when formats is missing', () => {
    const module = new CustomStickers(makeApp('/tmp'), {
      customStickers: { enabled: true },
    });
    assert.deepStrictEqual(
      module.getAllowedFormats(),
      ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    );
  });
});

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

describe('CustomStickers.deriveSlug', () => {
  it('extracts the last path segment without extension', () => {
    assert.strictEqual(
      CustomStickers.deriveSlug('https://example.com/path/to/Cat-Smile.PNG'),
      'cat-smile',
    );
  });
  it('falls back to hostname when path is empty', () => {
    // The trailing `.com` is stripped as an extension; the remaining
    // hostname is sanitised. We accept this for the degenerate case.
    assert.strictEqual(
      CustomStickers.deriveSlug('https://stickers.example.com/'),
      'stickers-example',
    );
  });
  it('caps slug length to 48 characters', () => {
    const long = 'a'.repeat(120);
    const slug = CustomStickers.deriveSlug(`https://example.com/${long}.png`);
    assert.ok(slug.length <= 48);
  });
  it('returns a safe default for unparseable URLs', () => {
    assert.strictEqual(CustomStickers.deriveSlug('not a url at all'), 'sticker');
  });
  it('strips non-alphanumeric runs', () => {
    assert.strictEqual(
      CustomStickers.deriveSlug('https://example.com/hello%20world!!.gif'),
      'hello-20world',
    );
  });
});

describe('CustomStickers handleImportStickerUrl', () => {
  let tmpRoot;
  let stickerFolder;
  let module;
  let originalFetch;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tfl-urlimport-'));
    stickerFolder = path.join(tmpRoot, 'stickers');
    fs.mkdirSync(stickerFolder);

    const config = {
      customStickers: {
        enabled: true,
        folder: stickerFolder,
        formats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
        urlImport: {
          enabled: true,
          allowedContentTypes: [
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
          ],
          maxBytes: 1024,
        },
      },
    };
    module = new CustomStickers(makeApp(tmpRoot), config);
    module.initialize();
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function stubFetch({ ok = true, status = 200, contentType = 'image/png', body = PNG_BYTES, contentLength }) {
    globalThis.fetch = async () => ({
      ok,
      status,
      headers: {
        get: (key) => {
          const k = key.toLowerCase();
          if (k === 'content-type') return contentType;
          if (k === 'content-length') return String(contentLength ?? body.length);
          return null;
        },
      },
      arrayBuffer: async () =>
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });
  }

  it('rejects non-HTTPS URLs', async () => {
    const result = await module.handleImportStickerUrl('http://example.com/cat.png');
    assert.strictEqual(result.success, false);
    assert.match(result.error, /HTTPS/);
  });

  it('rejects unparseable URLs', async () => {
    const result = await module.handleImportStickerUrl('not a url');
    assert.strictEqual(result.success, false);
    assert.match(result.error, /Invalid URL/);
  });

  it('rejects when the response content-type is not on the allowlist', async () => {
    stubFetch({ contentType: 'text/html' });
    const result = await module.handleImportStickerUrl('https://example.com/page.html');
    assert.strictEqual(result.success, false);
    assert.match(result.error, /content-type/);
  });

  it('rejects when declared content-length exceeds the cap', async () => {
    stubFetch({ contentLength: 99999 });
    const result = await module.handleImportStickerUrl('https://example.com/big.png');
    assert.strictEqual(result.success, false);
    assert.match(result.error, /too large/);
  });

  it('writes the file and returns the filename on a happy-path import', async () => {
    stubFetch({});
    const result = await module.handleImportStickerUrl('https://example.com/path/cute.png');
    assert.strictEqual(result.success, true);
    assert.match(result.filename, /^cute-[0-9a-f]{8}\.png$/);
    const written = fs.readFileSync(path.join(stickerFolder, result.filename));
    assert.deepStrictEqual(Uint8Array.from(written), Uint8Array.from(PNG_BYTES));
  });

  it('respects the urlImport.enabled flag', async () => {
    const disabled = new CustomStickers(makeApp(tmpRoot), {
      customStickers: {
        enabled: true,
        folder: stickerFolder,
        urlImport: { enabled: false },
      },
    });
    const result = await disabled.handleImportStickerUrl('https://example.com/cat.png');
    assert.strictEqual(result.success, false);
    assert.match(result.error, /disabled/);
  });
});

describe('CustomStickers handleDeleteSticker', () => {
  let tmpRoot;
  let stickerFolder;
  let outsideFile;
  let module;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tfl-delete-'));
    stickerFolder = path.join(tmpRoot, 'stickers');
    fs.mkdirSync(stickerFolder);
    fs.mkdirSync(path.join(stickerFolder, 'pack'));
    fs.writeFileSync(path.join(stickerFolder, 'top.png'), PNG_BYTES);
    fs.writeFileSync(path.join(stickerFolder, 'pack', 'p1.png'), PNG_BYTES);

    // A file outside the sticker folder; path-traversal attempts must not
    // reach this.
    outsideFile = path.join(tmpRoot, 'outside-secret.txt');
    fs.writeFileSync(outsideFile, 'do not delete');

    module = new CustomStickers(makeApp(tmpRoot), {
      customStickers: { enabled: true, folder: stickerFolder },
    });
    module.initialize();
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('deletes a top-level sticker by name', () => {
    fs.writeFileSync(path.join(stickerFolder, 'doomed.png'), PNG_BYTES);
    const result = module.handleDeleteSticker({ name: 'doomed.png', subfolder: '' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(fs.existsSync(path.join(stickerFolder, 'doomed.png')), false);
  });

  it('deletes a sticker inside a subfolder', () => {
    fs.writeFileSync(path.join(stickerFolder, 'pack', 'doomed.png'), PNG_BYTES);
    const result = module.handleDeleteSticker({ name: 'doomed.png', subfolder: 'pack' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(
      fs.existsSync(path.join(stickerFolder, 'pack', 'doomed.png')),
      false,
    );
  });

  it('rejects a name with a slash', () => {
    const result = module.handleDeleteSticker({ name: '../outside-secret.txt', subfolder: '' });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /Invalid sticker name/);
    assert.strictEqual(fs.existsSync(outsideFile), true);
  });

  it('rejects a name that is ".."', () => {
    const result = module.handleDeleteSticker({ name: '..', subfolder: '' });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /Invalid sticker name/);
  });

  it('rejects a subfolder with a slash', () => {
    const result = module.handleDeleteSticker({ name: 'p1.png', subfolder: 'pack/nested' });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /Invalid subfolder/);
  });

  it('rejects a subfolder that is ".."', () => {
    const result = module.handleDeleteSticker({ name: 'p1.png', subfolder: '..' });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /Invalid subfolder/);
    assert.strictEqual(fs.existsSync(outsideFile), true);
  });

  it('returns "Sticker not found" when the file is missing', () => {
    const result = module.handleDeleteSticker({ name: 'never-existed.png', subfolder: '' });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /not found/);
  });

  it('rejects when custom stickers is disabled', () => {
    const disabled = new CustomStickers(makeApp(tmpRoot), {
      customStickers: { enabled: false, folder: stickerFolder },
    });
    const result = disabled.handleDeleteSticker({ name: 'top.png', subfolder: '' });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /disabled/);
  });
});

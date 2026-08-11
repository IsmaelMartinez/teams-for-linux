'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electronPath = require.resolve('electron');
const cacheManagerPath = require.resolve('../../app/cacheManager');

let tempRoot;
let CacheManager;

function installElectronMock(userDataPath) {
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      app: {
        getPath: () => userDataPath,
      },
    },
  };

  delete require.cache[cacheManagerPath];
  CacheManager = require('../../app/cacheManager');
}

function cleanupElectronMock() {
  delete require.cache[electronPath];
  delete require.cache[cacheManagerPath];
  CacheManager = undefined;
}

function makeManager() {
  return new CacheManager({ partition: 'persist:teams-4-linux' });
}

describe('CacheManager directory scanning', () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-manager-test-'));
    installElectronMock(tempRoot);
  });

  afterEach(() => {
    cleanupElectronMock();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('getDirSize', () => {
    it('sums file sizes recursively, following symlinks', async () => {
      const dir = path.join(tempRoot, 'scan');
      fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'a.txt'), 'aaaaa'); // 5 bytes
      fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'bbbbbbbbbb'); // 10 bytes

      // Symlink to a file outside the scanned directory counts the target size
      const outsideFile = path.join(tempRoot, 'outside.txt');
      fs.writeFileSync(outsideFile, 'ccccccc'); // 7 bytes
      fs.symlinkSync(outsideFile, path.join(dir, 'link-to-file'));

      const size = await makeManager().getDirSize(dir);
      assert.strictEqual(size, 22);
    });

    it('counts broken symlinks as zero without failing the scan', async () => {
      const dir = path.join(tempRoot, 'scan-broken');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'a.txt'), 'aaa'); // 3 bytes
      fs.symlinkSync(path.join(tempRoot, 'does-not-exist'), path.join(dir, 'broken'));

      const size = await makeManager().getDirSize(dir);
      assert.strictEqual(size, 3);
    });

    it('returns 0 for a missing path', async () => {
      const size = await makeManager().getDirSize(path.join(tempRoot, 'missing'));
      assert.strictEqual(size, 0);
    });

    it('returns the file size when given a file path', async () => {
      const filePath = path.join(tempRoot, 'single.txt');
      fs.writeFileSync(filePath, 'dddd'); // 4 bytes

      const size = await makeManager().getDirSize(filePath);
      assert.strictEqual(size, 4);
    });
  });

  describe('cleanDirectory', () => {
    it('removes files and empty subdirectories but keeps the root', async () => {
      const dir = path.join(tempRoot, 'clean');
      fs.mkdirSync(path.join(dir, 'sub', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'a.txt'), 'aaa');
      fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'bbb');
      fs.writeFileSync(path.join(dir, 'sub', 'nested', 'c.txt'), 'ccc');

      await makeManager().cleanDirectory(dir);

      assert.ok(fs.existsSync(dir), 'root directory should remain');
      assert.deepStrictEqual(fs.readdirSync(dir), [], 'root should be emptied');
    });

    it('unlinks a symlink to a file without deleting the target', async () => {
      const dir = path.join(tempRoot, 'clean-link');
      fs.mkdirSync(dir);
      const outsideFile = path.join(tempRoot, 'keep.txt');
      fs.writeFileSync(outsideFile, 'keep');
      fs.symlinkSync(outsideFile, path.join(dir, 'link-to-file'));

      await makeManager().cleanDirectory(dir);

      assert.deepStrictEqual(fs.readdirSync(dir), []);
      assert.ok(fs.existsSync(outsideFile), 'symlink target should survive');
    });

    // Characterisation test: pins the pre-existing stat-following behaviour,
    // not a desired specification.
    it('empties a symlinked directory target, matching stat-following behaviour', async () => {
      const dir = path.join(tempRoot, 'clean-dirlink');
      fs.mkdirSync(dir);
      const outsideDir = path.join(tempRoot, 'outside-dir');
      fs.mkdirSync(outsideDir);
      fs.writeFileSync(path.join(outsideDir, 'c.txt'), 'ccc');
      fs.symlinkSync(outsideDir, path.join(dir, 'link-to-dir'));

      await makeManager().cleanDirectory(dir);

      // fsp.stat follows the link, so the target directory gets emptied;
      // rmdir on the symlink itself fails (ENOTDIR), so the link remains.
      assert.ok(fs.existsSync(outsideDir), 'target directory should remain');
      assert.deepStrictEqual(fs.readdirSync(outsideDir), [], 'target should be emptied');
      assert.deepStrictEqual(fs.readdirSync(dir), ['link-to-dir']);
    });

    it('continues cleaning siblings when one entry cannot be removed', async () => {
      const dir = path.join(tempRoot, 'clean-locked');
      const lockedDir = path.join(dir, 'locked');
      fs.mkdirSync(lockedDir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'a.txt'), 'aaa');
      fs.writeFileSync(path.join(dir, 'b.txt'), 'bbb');
      fs.writeFileSync(path.join(lockedDir, 'c.txt'), 'ccc');
      // Read-only directory: unlinking its contents fails with EACCES
      fs.chmodSync(lockedDir, 0o555);

      try {
        await makeManager().cleanDirectory(dir);

        // The awaited promise settling means all fs work finished; siblings
        // must be gone even though the locked entry failed.
        assert.ok(!fs.existsSync(path.join(dir, 'a.txt')), 'sibling a.txt should be removed');
        assert.ok(!fs.existsSync(path.join(dir, 'b.txt')), 'sibling b.txt should be removed');
        assert.ok(fs.existsSync(path.join(lockedDir, 'c.txt')), 'locked entry contents remain');
      } finally {
        // Restore before the suite afterEach removes tempRoot
        fs.chmodSync(lockedDir, 0o755);
      }
    });

    it('skips a broken symlink and still cleans its siblings', async () => {
      const dir = path.join(tempRoot, 'clean-broken');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'a.txt'), 'aaa');
      fs.symlinkSync(path.join(tempRoot, 'does-not-exist'), path.join(dir, 'broken'));

      await makeManager().cleanDirectory(dir);

      // The dangling link's stat resolves ENOENT, which is suppressed as
      // routine mid-clean eviction, so the link itself is skipped.
      assert.ok(!fs.existsSync(path.join(dir, 'a.txt')), 'sibling should be removed');
      assert.deepStrictEqual(fs.readdirSync(dir), ['broken']);
    });
  });
});

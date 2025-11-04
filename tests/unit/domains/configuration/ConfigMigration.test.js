const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock logger
const mockLogger = {
  _logs: [],
  info: (...args) => mockLogger._logs.push({ level: 'info', args }),
  warn: (...args) => mockLogger._logs.push({ level: 'warn', args }),
  error: (...args) => mockLogger._logs.push({ level: 'error', args }),
  _reset() {
    this._logs = [];
  }
};

const projectRoot = path.resolve(__dirname, '../../../..');
const ConfigMigration = require(path.join(projectRoot, 'app/domains/configuration/ConfigMigration'));

describe('ConfigMigration', () => {
  let tempDir;
  let migration;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-migration-test-'));
    mockLogger._reset();
    migration = new ConfigMigration(tempDir, mockLogger);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should create migration instance with config path', () => {
      assert.ok(migration);
      assert.strictEqual(migration._configPath, tempDir);
    });
  });

  describe('needsMigration', () => {
    it('should return false if already migrated', () => {
      // Create migration marker
      const markerPath = path.join(tempDir, '.v3-migrated');
      fs.writeFileSync(markerPath, JSON.stringify({ migratedAt: new Date().toISOString() }));

      const needs = migration.needsMigration();

      assert.strictEqual(needs, false);
    });

    it('should return true if v2.x config.json exists', () => {
      // Create v2.x config
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ partition: 'persist:teams' }));

      const needs = migration.needsMigration();

      assert.strictEqual(needs, true);
    });

    it('should return false if no v2.x config exists', () => {
      const needs = migration.needsMigration();

      assert.strictEqual(needs, false);
    });
  });

  describe('migrate', () => {
    it('should successfully migrate v2.x configuration', async () => {
      // Create v2.x config
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        partition: 'persist:teams',
        url: 'https://teams.microsoft.com'
      }));

      const result = await migration.migrate();

      assert.strictEqual(result.success, true);
      assert.ok(result.backupPath);
      assert.ok(result.migratedKeys);
      assert.ok(Array.isArray(result.migratedKeys));
    });

    it('should create backup before migration', async () => {
      // Create v2.x config
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ partition: 'persist:teams' }));

      const result = await migration.migrate();

      assert.ok(result.backupPath);
      assert.ok(fs.existsSync(result.backupPath));

      // Verify backup contains config.json
      const backupConfigPath = path.join(result.backupPath, 'config.json');
      assert.ok(fs.existsSync(backupConfigPath));
    });

    it('should create migration marker after successful migration', async () => {
      // Create v2.x config
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ partition: 'persist:teams' }));

      await migration.migrate();

      const markerPath = path.join(tempDir, '.v3-migrated');
      assert.ok(fs.existsSync(markerPath));

      const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
      assert.ok(markerData.migratedAt);
      assert.strictEqual(markerData.fromVersion, '2.x');
      assert.strictEqual(markerData.toVersion, '3.0');
    });

    it('should migrate both config and settings keys correctly', async () => {
      // Create v2.x config with various keys
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        partition: 'persist:teams',
        url: 'https://teams.microsoft.com',
        customCSSName: 'dark-theme.css'
      }));

      // Create v2.x settings
      const settingsPath = path.join(tempDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({
        startMinimized: false,
        menubar: 'show',
        disableNotifications: false
      }));

      const result = await migration.migrate();

      // Verify config keys
      assert.ok(result.migratedKeys.includes('config.partition'));
      assert.ok(result.migratedKeys.includes('config.url'));
      assert.ok(result.migratedKeys.includes('config.customCSSName'));

      // Verify settings keys
      assert.ok(result.migratedKeys.includes('settings.startMinimized'));
      assert.ok(result.migratedKeys.includes('settings.menubar'));
      assert.ok(result.migratedKeys.includes('settings.disableNotifications'));
    });
  });

  describe('getStatus', () => {
    it('should return not migrated status initially', () => {
      const status = migration.getStatus();

      assert.strictEqual(status.isMigrated, false);
      assert.strictEqual(status.configPath, tempDir);
      assert.ok(status.markerFile);
    });

    it('should return migrated status after migration', async () => {
      // Create v2.x config and migrate
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ partition: 'persist:teams' }));
      await migration.migrate();

      const status = migration.getStatus();

      assert.strictEqual(status.isMigrated, true);
      assert.ok(status.migrationInfo);
      assert.ok(status.migrationInfo.migratedAt);
      assert.strictEqual(status.migrationInfo.fromVersion, '2.x');
      assert.strictEqual(status.migrationInfo.toVersion, '3.0');
    });
  });

  describe('listBackups', () => {
    it('should return empty array when no backups exist', () => {
      const backups = migration.listBackups();

      assert.ok(Array.isArray(backups));
      assert.strictEqual(backups.length, 0);
    });

    it('should list backups after migration', async () => {
      // Create v2.x config and migrate
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ partition: 'persist:teams' }));
      await migration.migrate();

      const backups = migration.listBackups();

      assert.ok(Array.isArray(backups));
      assert.strictEqual(backups.length, 1);
      assert.ok(backups[0].name.startsWith('backup-v2-'));
      assert.ok(backups[0].path);
      assert.ok(backups[0].createdAt);
      assert.ok(typeof backups[0].size === 'number');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty config.json', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, '{}');

      const result = await migration.migrate();

      assert.strictEqual(result.success, true);
    });

    it('should handle malformed config.json gracefully', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, 'invalid json{{{');

      const result = await migration.migrate();

      // Should still succeed (just warns about malformed file)
      assert.strictEqual(result.success, true);
      const warnLogs = mockLogger._logs.filter(l => l.level === 'warn');
      assert.ok(warnLogs.length > 0);
    });

    it('should handle both config and settings files', async () => {
      const configPath = path.join(tempDir, 'config.json');
      const settingsPath = path.join(tempDir, 'settings.json');

      fs.writeFileSync(configPath, JSON.stringify({
        partition: 'persist:teams',
        url: 'https://teams.microsoft.com'
      }));

      fs.writeFileSync(settingsPath, JSON.stringify({
        startMinimized: false,
        menubar: 'show'
      }));

      const result = await migration.migrate();

      assert.strictEqual(result.success, true);
      // Should have migrated keys from both stores
      const configKeys = result.migratedKeys.filter(k => k.startsWith('config.'));
      const settingsKeys = result.migratedKeys.filter(k => k.startsWith('settings.'));

      assert.ok(configKeys.length > 0);
      assert.ok(settingsKeys.length > 0);
    });

    it('should handle missing config directory gracefully', () => {
      const nonExistentDir = path.join(tempDir, 'nonexistent');
      const migration2 = new ConfigMigration(nonExistentDir, mockLogger);

      const needs = migration2.needsMigration();
      assert.strictEqual(needs, false);

      const backups = migration2.listBackups();
      assert.strictEqual(backups.length, 0);
    });

    it('should not re-migrate if already migrated', async () => {
      // First migration
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ partition: 'persist:teams' }));
      await migration.migrate();

      // Try to migrate again
      const needs = migration.needsMigration();
      assert.strictEqual(needs, false);
    });
  });
});

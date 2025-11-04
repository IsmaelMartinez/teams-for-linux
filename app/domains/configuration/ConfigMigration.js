const fs = require('fs');
const path = require('path');

/**
 * ConfigMigration - Configuration migration tool for v2.x to v3.0
 *
 * Handles automatic migration of configuration from v2.x format to v3.0:
 * - Detects if migration is needed
 * - Creates backup of v2.x configuration
 * - Migrates settings to new format
 * - Provides rollback mechanism for failed migrations
 * - Logs all migration steps
 *
 * Usage:
 *   const migration = new ConfigMigration(configPath, logger);
 *   if (migration.needsMigration()) {
 *     await migration.migrate();
 *   }
 */
class ConfigMigration {
  /**
   * @param {string} configPath - Path to configuration directory
   * @param {Object} logger - Logger instance for migration logging
   */
  constructor(configPath, logger = console) {
    this._configPath = configPath;
    this._logger = logger;
    this._backupPath = null;
    this._migrationMarkerFile = path.join(configPath, '.v3-migrated');
  }

  /**
   * Check if migration is needed
   * @returns {boolean} True if migration needed
   */
  needsMigration() {
    // Check if already migrated
    if (fs.existsSync(this._migrationMarkerFile)) {
      this._logger.info('Configuration already migrated to v3.0');
      return false;
    }

    // Check if v2.x config exists
    const configJsonPath = path.join(this._configPath, 'config.json');
    const settingsJsonPath = path.join(this._configPath, 'settings.json');

    const hasV2Config = fs.existsSync(configJsonPath) || fs.existsSync(settingsJsonPath);

    if (hasV2Config) {
      this._logger.info('v2.x configuration detected, migration needed');
      return true;
    }

    this._logger.info('No v2.x configuration found, migration not needed');
    return false;
  }

  /**
   * Perform configuration migration
   * @returns {Promise<Object>} Migration result
   */
  async migrate() {
    this._logger.info('Starting configuration migration from v2.x to v3.0...');

    try {
      // Step 1: Create backup
      this._logger.info('Step 1/4: Creating backup of v2.x configuration');
      await this._createBackup();

      // Step 2: Detect current config format
      this._logger.info('Step 2/4: Detecting v2.x configuration format');
      const v2Config = this._detectV2Config();

      // Step 3: Migrate configuration
      this._logger.info('Step 3/4: Migrating configuration to v3.0 format');
      const migrationResult = await this._migrateConfig(v2Config);

      // Step 4: Mark as migrated
      this._logger.info('Step 4/4: Marking migration as complete');
      this._createMigrationMarker();

      this._logger.info('Configuration migration completed successfully', {
        migratedKeys: migrationResult.migratedKeys,
        skippedKeys: migrationResult.skippedKeys,
        backupPath: this._backupPath
      });

      return {
        success: true,
        migratedKeys: migrationResult.migratedKeys,
        skippedKeys: migrationResult.skippedKeys,
        backupPath: this._backupPath
      };

    } catch (error) {
      this._logger.error('Configuration migration failed', {
        error: error.message,
        stack: error.stack
      });

      // Attempt rollback
      await this._rollback();

      return {
        success: false,
        error: error.message,
        rolledBack: true
      };
    }
  }

  /**
   * Create backup of v2.x configuration
   * @private
   * @returns {Promise<void>}
   */
  async _createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this._backupPath = path.join(this._configPath, `backup-v2-${timestamp}`);

    // Create backup directory
    if (!fs.existsSync(this._backupPath)) {
      fs.mkdirSync(this._backupPath, { recursive: true });
    }

    // Backup all json files
    const files = fs.readdirSync(this._configPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const sourcePath = path.join(this._configPath, file);
      const destPath = path.join(this._backupPath, file);

      fs.copyFileSync(sourcePath, destPath);
      this._logger.info(`Backed up: ${file}`);
    }

    this._logger.info(`Backup created at: ${this._backupPath}`);
  }

  /**
   * Detect v2.x configuration format
   * @private
   * @returns {Object} Detected v2.x configuration
   */
  _detectV2Config() {
    const configJsonPath = path.join(this._configPath, 'config.json');
    const settingsJsonPath = path.join(this._configPath, 'settings.json');

    const v2Config = {
      config: {},
      settings: {}
    };

    // Read legacy config store
    if (fs.existsSync(configJsonPath)) {
      try {
        const data = fs.readFileSync(configJsonPath, 'utf-8');
        v2Config.config = JSON.parse(data);
        this._logger.info('Loaded v2.x config.json', {
          keys: Object.keys(v2Config.config).length
        });
      } catch (error) {
        this._logger.warn('Failed to parse config.json', {
          error: error.message
        });
      }
    }

    // Read settings store
    if (fs.existsSync(settingsJsonPath)) {
      try {
        const data = fs.readFileSync(settingsJsonPath, 'utf-8');
        v2Config.settings = JSON.parse(data);
        this._logger.info('Loaded v2.x settings.json', {
          keys: Object.keys(v2Config.settings).length
        });
      } catch (error) {
        this._logger.warn('Failed to parse settings.json', {
          error: error.message
        });
      }
    }

    return v2Config;
  }

  /**
   * Migrate configuration to v3.0 format
   * @private
   * @param {Object} v2Config - v2.x configuration
   * @returns {Promise<Object>} Migration result
   */
  async _migrateConfig(v2Config) {
    const migratedKeys = [];
    const skippedKeys = [];

    // Config migration rules
    const configMigrations = {
      // Most config keys stay the same, just preserve them
      preserve: [
        'partition',
        'customCSSName',
        'customCSSLocation',
        'chromeUserAgent',
        'ntlmV2enabled',
        'authServerWhitelist',
        'customBGColor',
        'url',
        'appTitle',
        'appIconPath'
      ]
    };

    // Settings migration rules
    const settingsMigrations = {
      // Settings keys to preserve
      preserve: [
        'startMinimized',
        'menubar',
        'disableNotifications',
        'disableNotificationSound',
        'disableNotificationWindowFlash',
        'awayOnLock',
        'appIdleTimeout',
        'appIdleTimeoutEnabled'
      ]
    };

    // Migrate config keys (preserve as-is)
    for (const key of configMigrations.preserve) {
      if (v2Config.config[key] !== undefined) {
        // In v3.0, these are preserved in the same store
        migratedKeys.push(`config.${key}`);
      }
    }

    // Migrate settings keys (preserve as-is)
    for (const key of settingsMigrations.preserve) {
      if (v2Config.settings[key] !== undefined) {
        // In v3.0, these are preserved in settings store
        migratedKeys.push(`settings.${key}`);
      }
    }

    // Handle deprecated keys
    const deprecatedKeys = ['oldKey1', 'oldKey2']; // Add actual deprecated keys
    for (const key of deprecatedKeys) {
      if (v2Config.config[key] !== undefined || v2Config.settings[key] !== undefined) {
        skippedKeys.push(key);
        this._logger.warn(`Skipping deprecated key: ${key}`);
      }
    }

    this._logger.info('Configuration migration mapping complete', {
      migratedKeys: migratedKeys.length,
      skippedKeys: skippedKeys.length
    });

    return {
      migratedKeys,
      skippedKeys
    };
  }

  /**
   * Create migration marker file
   * @private
   */
  _createMigrationMarker() {
    const markerData = {
      migratedAt: new Date().toISOString(),
      fromVersion: '2.x',
      toVersion: '3.0',
      backupPath: this._backupPath
    };

    fs.writeFileSync(
      this._migrationMarkerFile,
      JSON.stringify(markerData, null, 2),
      'utf-8'
    );

    this._logger.info('Migration marker created');
  }

  /**
   * Rollback migration on failure
   * @private
   * @returns {Promise<void>}
   */
  async _rollback() {
    this._logger.warn('Attempting to rollback migration...');

    if (!this._backupPath || !fs.existsSync(this._backupPath)) {
      this._logger.error('Cannot rollback: backup not found');
      return;
    }

    try {
      // Restore backed up files
      const files = fs.readdirSync(this._backupPath);

      for (const file of files) {
        const backupFilePath = path.join(this._backupPath, file);
        const restorePath = path.join(this._configPath, file);

        fs.copyFileSync(backupFilePath, restorePath);
        this._logger.info(`Restored: ${file}`);
      }

      // Remove migration marker if it exists
      if (fs.existsSync(this._migrationMarkerFile)) {
        fs.unlinkSync(this._migrationMarkerFile);
      }

      this._logger.info('Rollback completed successfully');
    } catch (error) {
      this._logger.error('Rollback failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Get migration status
   * @returns {Object} Migration status information
   */
  getStatus() {
    const status = {
      isMigrated: fs.existsSync(this._migrationMarkerFile),
      configPath: this._configPath,
      markerFile: this._migrationMarkerFile
    };

    if (status.isMigrated) {
      try {
        const markerData = JSON.parse(
          fs.readFileSync(this._migrationMarkerFile, 'utf-8')
        );
        status.migrationInfo = markerData;
      } catch (error) {
        this._logger.warn('Failed to read migration marker', {
          error: error.message
        });
      }
    }

    return status;
  }

  /**
   * List available backups
   * @returns {Array<Object>} List of backup directories
   */
  listBackups() {
    const backups = [];

    if (!fs.existsSync(this._configPath)) {
      return backups;
    }

    const files = fs.readdirSync(this._configPath);
    const backupDirs = files.filter(f => f.startsWith('backup-v2-'));

    for (const dir of backupDirs) {
      const fullPath = path.join(this._configPath, dir);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        backups.push({
          name: dir,
          path: fullPath,
          createdAt: stat.birthtime,
          size: this._getDirectorySize(fullPath)
        });
      }
    }

    return backups.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get directory size recursively
   * @private
   * @param {string} dirPath - Directory path
   * @returns {number} Size in bytes
   */
  _getDirectorySize(dirPath) {
    let size = 0;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        size += this._getDirectorySize(filePath);
      } else {
        size += stat.size;
      }
    }

    return size;
  }
}

module.exports = ConfigMigration;

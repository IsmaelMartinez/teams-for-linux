// Token Migration from localStorage to Secure Storage
// v2.5.6: Handles migration of authentication tokens from localStorage to OS-backed secure storage
// Part of Phase 2 token cache enhancement

/**
 * TokenMigration - Manages migration from localStorage to secure storage
 * 
 * This module provides safe migration of authentication tokens from localStorage
 * to Electron's safeStorage API with comprehensive backup and rollback capabilities.
 * 
 * Key Features:
 * - One-time migration detection and execution
 * - Backup creation before migration starts
 * - Integrity validation of migrated tokens
 * - Automatic rollback on migration failures
 * - Detailed migration reporting and logging
 * - Safe cleanup of localStorage after successful migration
 */

class TokenMigration {
  constructor() {
    this._migrationStatus = 'not_started';
    this._migrationResults = null;
    this._backupData = null;
    this._secureStorage = null;
    this._tokenCache = null;
    
    // Migration state tracking
    this._lastMigrationAttempt = null;
    this._migrationVersion = '1.0';
    this._migrationKey = 'teams_token_migration_status';
    
    console.debug('[TOKEN_MIGRATION] TokenMigration initialized');
  }

  /**
   * Check if migration has been completed
   * @returns {boolean} True if migration is complete
   */
  isMigrationComplete() {
    try {
      const status = localStorage.getItem(this._migrationKey);
      return status === 'completed';
    } catch (error) {
      console.warn('[TOKEN_MIGRATION] Failed to check migration status:', error.message);
      return false;
    }
  }

  /**
   * Check if migration is needed
   * @returns {boolean} True if migration should be performed
   */
  async isMigrationNeeded() {
    try {
      // Skip if already completed
      if (this.isMigrationComplete()) {
        return false;
      }

      // Initialize dependencies
      await this._initializeDependencies();

      // Check if secure storage is available
      if (!this._secureStorage || !this._secureStorage.isSecureStorageAvailable()) {
        console.debug('[TOKEN_MIGRATION] Secure storage not available, migration not needed');
        return false;
      }

      // Check if there are localStorage tokens to migrate
      const localAuthKeys = this._getLocalStorageAuthKeys();
      const migrationNeeded = localAuthKeys.length > 0;

      console.debug('[TOKEN_MIGRATION] Migration needed check:', {
        needed: migrationNeeded,
        tokenCount: localAuthKeys.length,
        secureAvailable: true
      });

      return migrationNeeded;

    } catch (error) {
      console.error('[TOKEN_MIGRATION] Failed to check migration need:', error);
      return false;
    }
  }

  /**
   * Perform the token migration from localStorage to secure storage
   * @returns {Object} Migration results
   */
  async performMigration() {
    const migrationStart = Date.now();
    
    try {
      console.log('[TOKEN_MIGRATION] Starting token migration to secure storage...');
      
      this._migrationStatus = 'in_progress';
      this._lastMigrationAttempt = new Date().toISOString();
      
      // Step 1: Initialize dependencies
      await this._initializeDependencies();
      
      // Step 2: Validate prerequisites
      await this._validateMigrationPrerequisites();
      
      // Step 3: Create backup
      await this._createBackup();
      
      // Step 4: Perform migration
      const migrationResults = await this._executeMigration();
      
      // Step 5: Validate migration
      await this._validateMigration(migrationResults);
      
      // Step 6: Cleanup localStorage (but keep backup reference)
      await this._cleanupAfterMigration(migrationResults);
      
      // Step 7: Mark migration as complete
      this._markMigrationComplete();
      
      const migrationDuration = Date.now() - migrationStart;
      
      const finalResults = {
        ...migrationResults,
        status: 'completed',
        duration: migrationDuration,
        timestamp: new Date().toISOString(),
        version: this._migrationVersion
      };
      
      this._migrationResults = finalResults;
      this._migrationStatus = 'completed';
      
      console.log('[TOKEN_MIGRATION] Migration completed successfully:', finalResults);
      return finalResults;
      
    } catch (error) {
      console.error('[TOKEN_MIGRATION] Migration failed:', error);
      
      // Attempt rollback if we have backup data
      if (this._backupData) {
        await this._performRollback();
      }
      
      this._migrationStatus = 'failed';
      
      const failedResults = {
        status: 'failed',
        error: error.message,
        duration: Date.now() - migrationStart,
        timestamp: new Date().toISOString(),
        rollbackPerformed: !!this._backupData
      };
      
      this._migrationResults = failedResults;
      throw error;
    }
  }

  /**
   * Get migration status and results
   * @returns {Object} Current migration status
   */
  getMigrationStatus() {
    return {
      status: this._migrationStatus,
      lastAttempt: this._lastMigrationAttempt,
      results: this._migrationResults,
      isComplete: this.isMigrationComplete()
    };
  }

  /**
   * Rollback migration if something goes wrong
   * @returns {Object} Rollback results
   */
  async performRollback() {
    try {
      console.warn('[TOKEN_MIGRATION] Performing manual migration rollback...');
      return await this._performRollback();
    } catch (error) {
      console.error('[TOKEN_MIGRATION] Rollback failed:', error);
      throw error;
    }
  }

  //
  // Private Implementation Methods
  //

  /**
   * Initialize required dependencies
   * @private
   */
  async _initializeDependencies() {
    try {
      if (!this._secureStorage) {
        this._secureStorage = require('./secureTokenStorage');
      }
      
      if (!this._tokenCache) {
        this._tokenCache = require('./tokenCache');
      }
      
      console.debug('[TOKEN_MIGRATION] Dependencies initialized');
    } catch (error) {
      throw new Error(`Failed to initialize migration dependencies: ${error.message}`);
    }
  }

  /**
   * Validate that migration can proceed
   * @private
   */
  async _validateMigrationPrerequisites() {
    // Check secure storage availability
    if (!this._secureStorage.isSecureStorageAvailable()) {
      throw new Error('Secure storage is not available on this system');
    }

    // Check localStorage accessibility
    try {
      const testKey = '__migration_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (error) {
      throw new Error('localStorage is not accessible for migration');
    }

    // Check that we're not already in progress
    if (this._migrationStatus === 'in_progress') {
      throw new Error('Migration is already in progress');
    }

    console.debug('[TOKEN_MIGRATION] Prerequisites validated');
  }

  /**
   * Create backup of current localStorage tokens
   * @private
   */
  async _createBackup() {
    try {
      const authKeys = this._getLocalStorageAuthKeys();
      const backup = {
        timestamp: new Date().toISOString(),
        version: this._migrationVersion,
        keys: {}
      };

      // Backup all auth-related data
      authKeys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            backup.keys[key] = value;
          }
        } catch (error) {
          console.warn(`[TOKEN_MIGRATION] Failed to backup key ${key}:`, error.message);
        }
      });

      this._backupData = backup;
      
      console.debug(`[TOKEN_MIGRATION] Created backup of ${Object.keys(backup.keys).length} tokens`);
      
    } catch (error) {
      throw new Error(`Failed to create migration backup: ${error.message}`);
    }
  }

  /**
   * Execute the actual migration to secure storage
   * @private
   */
  async _executeMigration() {
    try {
      console.log('[TOKEN_MIGRATION] Executing migration to secure storage...');
      
      // Use secureTokenStorage's migration method
      const migrationResults = await this._secureStorage.migrateFromLocalStorage();
      
      console.debug('[TOKEN_MIGRATION] Migration execution results:', migrationResults);
      return migrationResults;
      
    } catch (error) {
      throw new Error(`Migration execution failed: ${error.message}`);
    }
  }

  /**
   * Validate that migration was successful
   * @param {Object} migrationResults - Results from migration execution
   * @private
   */
  async _validateMigration(migrationResults) {
    try {
      console.debug('[TOKEN_MIGRATION] Validating migration results...');
      
      // Check migration results
      if (migrationResults.failedKeys > 0) {
        console.warn(`[TOKEN_MIGRATION] Migration had ${migrationResults.failedKeys} failures`);
      }
      
      if (migrationResults.migratedKeys === 0) {
        throw new Error('No tokens were successfully migrated');
      }
      
      // Validate that critical tokens are accessible in secure storage
      const sampleValidation = await this._validateSampleTokens();
      if (!sampleValidation.success) {
        throw new Error(`Token validation failed: ${sampleValidation.error}`);
      }
      
      console.debug('[TOKEN_MIGRATION] Migration validation passed');
      
    } catch (error) {
      throw new Error(`Migration validation failed: ${error.message}`);
    }
  }

  /**
   * Validate a sample of migrated tokens
   * @returns {Object} Validation results
   * @private
   */
  async _validateSampleTokens() {
    try {
      // Get a few key types to validate
      const storageInfo = this._secureStorage.getStorageInfo();
      
      if (storageInfo.secureKeyCount === 0) {
        return { success: false, error: 'No tokens found in secure storage' };
      }
      
      // Try to read back one of the original backup keys
      if (this._backupData && Object.keys(this._backupData.keys).length > 0) {
        const sampleKey = Object.keys(this._backupData.keys)[0];
        const originalValue = this._backupData.keys[sampleKey];
        
        try {
          const retrievedValue = await this._secureStorage.getItem(sampleKey);
          
          if (retrievedValue !== originalValue) {
            return { success: false, error: 'Token value mismatch after migration' };
          }
        } catch (error) {
          return { success: false, error: `Failed to retrieve migrated token: ${error.message}` };
        }
      }
      
      return { success: true };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup localStorage after successful migration
   * @param {Object} migrationResults - Migration results
   * @private
   */
  async _cleanupAfterMigration(migrationResults) {
    try {
      console.debug('[TOKEN_MIGRATION] Cleaning up localStorage after migration...');
      
      // Note: The secureTokenStorage migration already cleaned up localStorage
      // This is an additional safety check
      
      const remainingAuthKeys = this._getLocalStorageAuthKeys();
      if (remainingAuthKeys.length > 0) {
        console.warn(`[TOKEN_MIGRATION] Found ${remainingAuthKeys.length} remaining auth keys in localStorage`);
        
        // Clean up any remaining keys that weren't migrated
        remainingAuthKeys.forEach(key => {
          try {
            localStorage.removeItem(key);
          } catch (error) {
            console.warn(`[TOKEN_MIGRATION] Failed to cleanup key ${key}:`, error.message);
          }
        });
      }
      
      console.debug('[TOKEN_MIGRATION] LocalStorage cleanup completed');
      
    } catch (error) {
      console.warn('[TOKEN_MIGRATION] Cleanup failed (non-critical):', error.message);
    }
  }

  /**
   * Mark migration as completed
   * @private
   */
  _markMigrationComplete() {
    try {
      const completionData = {
        status: 'completed',
        timestamp: new Date().toISOString(),
        version: this._migrationVersion
      };
      
      localStorage.setItem(this._migrationKey, 'completed');
      localStorage.setItem(`${this._migrationKey}_data`, JSON.stringify(completionData));
      
      console.debug('[TOKEN_MIGRATION] Migration marked as complete');
      
    } catch (error) {
      console.warn('[TOKEN_MIGRATION] Failed to mark migration complete:', error.message);
    }
  }

  /**
   * Perform rollback to original localStorage state
   * @private
   */
  async _performRollback() {
    try {
      if (!this._backupData) {
        throw new Error('No backup data available for rollback');
      }
      
      console.warn('[TOKEN_MIGRATION] Performing rollback to localStorage...');
      
      // Clear any partial migration from secure storage
      try {
        await this._secureStorage.clear();
      } catch (error) {
        console.warn('[TOKEN_MIGRATION] Failed to clear secure storage during rollback:', error.message);
      }
      
      // Restore tokens to localStorage
      let restoredCount = 0;
      const errors = [];
      
      Object.entries(this._backupData.keys).forEach(([key, value]) => {
        try {
          localStorage.setItem(key, value);
          restoredCount++;
        } catch (error) {
          errors.push({ key, error: error.message });
          console.warn(`[TOKEN_MIGRATION] Failed to restore key ${key}:`, error.message);
        }
      });
      
      const rollbackResults = {
        status: 'rollback_completed',
        restoredCount,
        totalKeys: Object.keys(this._backupData.keys).length,
        errors,
        timestamp: new Date().toISOString()
      };
      
      console.warn('[TOKEN_MIGRATION] Rollback completed:', rollbackResults);
      return rollbackResults;
      
    } catch (error) {
      console.error('[TOKEN_MIGRATION] Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Get authentication-related keys from localStorage
   * @returns {string[]} Array of auth-related keys
   * @private
   */
  _getLocalStorageAuthKeys() {
    try {
      const allKeys = Object.keys(localStorage);
      const authPatterns = [
        /^tmp\.auth\.v1\./,              // Teams auth v1
        /^[0-9a-f-]{36}\..*\.refresh_token/, // Refresh tokens
        /^[0-9a-f-]{36}\..*\.idtoken/,   // ID tokens  
        /^msal\./                        // MSAL tokens
      ];

      return allKeys.filter(key => 
        authPatterns.some(pattern => pattern.test(key))
      );
    } catch (error) {
      console.warn('[TOKEN_MIGRATION] Failed to get localStorage auth keys:', error.message);
      return [];
    }
  }
}

// Export singleton instance following established pattern
module.exports = new TokenMigration();
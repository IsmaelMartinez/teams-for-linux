/**
 * Configuration IPC Handlers
 * 
 * Handles configuration-related IPC events including config retrieval,
 * zoom level management, and application version information.
 */

const path = require('path');

/**
 * Configuration handlers module
 * 
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.config - Application configuration object
 * @param {Function} dependencies.restartApp - Function to restart the application
 * @param {Function} dependencies.getPartition - Function to get partition data
 * @param {Function} dependencies.savePartition - Function to save partition data
 */
function createConfigurationHandlers(dependencies) {
  const { config, restartApp, getPartition, savePartition } = dependencies;

  const handlers = {
    'get-config': {
      type: 'handle',
      handler: async (event) => {
        console.debug('[Config] Retrieving application configuration');
        return config;
      },
      options: { 
        logArgs: false,  // Config keys might be sensitive
        logResult: false // Config data might contain sensitive info
      }
    },

    'get-app-version': {
      type: 'handle', 
      handler: async (event) => {
        console.debug('[Config] Retrieving application version');
        return config.appVersion;
      },
      options: { logResult: true }
    },

    'get-zoom-level': {
      type: 'handle',
      handler: async (event, name) => {
        console.debug(`[Config] Getting zoom level for partition: ${name}`);
        const partition = getPartition(name) || {};
        return partition.zoomLevel ? partition.zoomLevel : 0;
      },
      options: { logArgs: true, logResult: true }
    },

    'save-zoom-level': {
      type: 'handle',
      handler: async (event, args) => {
        console.debug(`[Config] Saving zoom level ${args.zoomLevel} for partition: ${args.partition}`);
        
        let partition = getPartition(args.partition) || {};
        partition.name = args.partition;
        partition.zoomLevel = args.zoomLevel;
        savePartition(partition);
        
        return { success: true };
      },
      options: { logArgs: true }
    },

    'config-file-changed': {
      type: 'on',
      handler: (event) => {
        console.info('[Config] Configuration file changed, restarting application');
        restartApp();
      },
      options: { logArgs: false }
    }
  };

  return handlers;
}

/**
 * Get partition data helper function signature
 * This should be implemented by the main application
 */
function getPartitionExample(name) {
  // Example implementation - should be provided by main app
  throw new Error('getPartition function must be provided by main application');
}

/**
 * Save partition data helper function signature  
 * This should be implemented by the main application
 */
function savePartitionExample(partition) {
  // Example implementation - should be provided by main app
  throw new Error('savePartition function must be provided by main application');
}

/**
 * Restart application helper function signature
 * This should be implemented by the main application
 */
function restartAppExample() {
  // Example implementation - should be provided by main app
  throw new Error('restartApp function must be provided by main application');
}

module.exports = {
  createConfigurationHandlers,
  
  // Export examples for documentation
  examples: {
    getPartition: getPartitionExample,
    savePartition: savePartitionExample,
    restartApp: restartAppExample
  }
};
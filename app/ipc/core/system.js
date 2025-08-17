/**
 * System State IPC Handlers
 * 
 * Handles system-related IPC events including idle state monitoring,
 * user status tracking, and system state management.
 */

/**
 * System handlers module
 * 
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.powerMonitor - Electron powerMonitor instance
 * @param {Object} dependencies.config - Application configuration object
 * @param {Object} dependencies.globals - Global state object with userStatus, idleTimeUserStatus
 */
function createSystemHandlers(dependencies) {
  const { powerMonitor, config, globals } = dependencies;

  const handlers = {
    'get-system-idle-state': {
      type: 'handle',
      handler: async (event) => {
        console.debug('[System] Checking system idle state');
        
        const systemIdleState = powerMonitor.getSystemIdleState(
          config.appIdleTimeout
        );
        
        // Track idle time user status
        if (systemIdleState !== "active" && globals.idleTimeUserStatus == -1) {
          globals.idleTimeUserStatus = globals.userStatus;
          console.debug(`[System] User went idle, previous status: ${globals.idleTimeUserStatus}`);
        }
        
        if (systemIdleState === "active" && globals.idleTimeUserStatus != -1) {
          globals.idleTimeUserStatus = -1;
          console.debug('[System] User became active again');
        }
        
        return {
          idleState: systemIdleState,
          idleTimeout: config.appIdleTimeout,
          userStatus: globals.userStatus,
          idleTimeUserStatus: globals.idleTimeUserStatus
        };
      },
      options: { logResult: true }
    },

    'user-status-changed': {
      type: 'handle',
      handler: async (event, options) => {
        const newStatus = options.data.status;
        const previousStatus = globals.userStatus;
        
        globals.userStatus = newStatus;
        console.debug(`[System] User status changed from '${previousStatus}' to '${newStatus}'`);
        
        return { 
          success: true, 
          previousStatus, 
          currentStatus: newStatus 
        };
      },
      options: { logArgs: true }
    },

    'get-user-status': {
      type: 'handle',
      handler: async (event) => {
        console.debug('[System] Retrieving current user status');
        return {
          userStatus: globals.userStatus,
          idleTimeUserStatus: globals.idleTimeUserStatus
        };
      },
      options: { logResult: true }
    }
  };

  return handlers;
}

/**
 * Initialize global state for system handlers
 * This should be called during application startup
 */
function initializeSystemGlobals() {
  return {
    userStatus: -1,
    idleTimeUserStatus: -1
  };
}

/**
 * Power monitor helper function signature
 * This should be provided by the main application (Electron powerMonitor)
 */
function powerMonitorExample() {
  // Example implementation - should be provided by main app
  throw new Error('powerMonitor must be provided by main application (Electron powerMonitor)');
}

module.exports = {
  createSystemHandlers,
  initializeSystemGlobals,
  
  // Export examples for documentation
  examples: {
    powerMonitor: powerMonitorExample,
    config: {
      appIdleTimeout: 5, // seconds
    },
    globals: {
      userStatus: -1,
      idleTimeUserStatus: -1
    }
  }
};
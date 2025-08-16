# IPC Organization Developer Guide

This guide provides practical instructions for working with the new IPC organization system in Teams for Linux.

## Quick Start

### 1. Basic Handler Registration

Replace direct `ipcMain` usage with the organized system:

```javascript
// Old approach (avoid)
const { ipcMain } = require('electron');
ipcMain.handle('get-user-data', async (event, userId) => {
  return await getUserData(userId);
});

// New approach (recommended)
const ipc = require('./app/ipc');

ipc.registerHandler('get-user-data', async (event, userId) => {
  return await getUserData(userId);
}, { logArgs: true });
```

### 2. Module-Based Organization

Group related handlers into modules:

```javascript
// app/ipc/features/userManagement.js
const userHandlers = {
  'get-user-profile': {
    type: 'handle',
    handler: async (event, userId) => {
      const profile = await fetchUserProfile(userId);
      return profile;
    },
    options: { logResult: true }
  },
  
  'user-status-changed': {
    type: 'on',
    handler: (event, statusData) => {
      updateUserStatus(statusData);
      notifyOtherComponents(statusData);
    }
  },
  
  'refresh-user-cache': {
    type: 'on',
    handler: () => {
      clearUserCache();
      console.info('[UserManagement] User cache refreshed');
    }
  }
};

module.exports = userHandlers;
```

### 3. Module Registration

Register modules during application initialization:

```javascript
// In your application startup code
const ipc = require('./app/ipc');
const userHandlers = require('./app/ipc/features/userManagement');
const configHandlers = require('./app/ipc/core/configuration');

// Initialize the IPC system
ipc.initialize();

// Register modules
ipc.registerModule('user-management', userHandlers);
ipc.registerModule('configuration', configHandlers);

console.info('IPC system initialized with organized handlers');
```

## Handler Types and Patterns

### Request-Response Handlers (`handle`)

Use for operations that return data:

```javascript
const handlers = {
  'get-app-config': {
    type: 'handle',
    handler: async (event, configKey) => {
      try {
        const config = await loadConfiguration(configKey);
        return { success: true, config };
      } catch (error) {
        console.error('[Config] Failed to load configuration:', error);
        return { success: false, error: error.message };
      }
    },
    options: { 
      logArgs: false,    // Don't log potentially sensitive config keys
      logResult: false   // Don't log potentially sensitive config data
    }
  }
};
```

### Event Listeners (`on`)

Use for fire-and-forget notifications:

```javascript
const handlers = {
  'app-settings-changed': {
    type: 'on',
    handler: (event, settingsData) => {
      // Update internal state
      updateApplicationSettings(settingsData);
      
      // Notify other components
      broadcastSettingsChange(settingsData);
      
      // Save to disk if needed
      if (settingsData.persistent) {
        saveSettingsToDisk(settingsData);
      }
    },
    options: { logArgs: true }
  }
};
```

### One-Time Handlers (`once`)

Use for initialization or single-use events:

```javascript
const handlers = {
  'app-initialization-complete': {
    type: 'once',
    handler: (event, initData) => {
      console.info('[App] Initialization complete:', initData);
      enableAllFeatures();
      showMainWindow();
    }
  }
};
```

## Performance Monitoring

### Automatic Performance Tracking

Wrap handlers for automatic timing:

```javascript
const ipc = require('./app/ipc');

// Wrap a potentially slow handler
const optimizedHandler = ipc.wrapHandler('heavy-computation', async (event, data) => {
  const result = await performExpensiveOperation(data);
  return result;
});

ipc.registerHandler('heavy-computation', optimizedHandler);
```

### Manual Performance Tracking

For fine-grained control:

```javascript
const ipc = require('./app/ipc');

const detailedHandler = async (event, data) => {
  const overallTimer = ipc.benchmark.startTiming('detailed-operation');
  
  try {
    const preprocessTimer = ipc.benchmark.startTiming('preprocess');
    const preprocessed = await preprocessData(data);
    preprocessTimer.end();
    
    const computeTimer = ipc.benchmark.startTiming('compute');
    const result = await computeResult(preprocessed);
    computeTimer.end();
    
    return result;
  } finally {
    overallTimer.end();
  }
};
```

### Performance Baselines

Establish baselines for regression testing:

```javascript
// During application startup
const ipc = require('./app/ipc');

// Save initial baseline
ipc.saveBaseline('startup-performance');

// Later, compare current performance
const currentMetrics = ipc.getMetrics();
const report = ipc.benchmark.generateReport();
console.log(report);
```

## Error Handling Patterns

### Handler-Level Error Handling

```javascript
const handlers = {
  'risky-operation': {
    type: 'handle',
    handler: async (event, data) => {
      try {
        const result = await performRiskyOperation(data);
        return { success: true, data: result };
      } catch (error) {
        console.error('[RiskyOp] Operation failed:', error);
        
        // Return structured error response
        return { 
          success: false, 
          error: error.message,
          code: error.code || 'UNKNOWN_ERROR'
        };
      }
    },
    options: { logArgs: true }
  }
};
```

### System-Level Error Handling

The IPC manager automatically handles and logs errors:

```javascript
// Errors are automatically caught and logged
ipc.registerHandler('auto-error-handling', async (event, data) => {
  // If this throws, it will be caught and logged automatically
  throw new Error('Something went wrong');
});

// The error will appear in logs as:
// [IPC-Manager] IPC handle error on channel 'auto-error-handling': Error: Something went wrong
```

## Migration Strategies

### Gradual Migration

Migrate handlers incrementally:

```javascript
const ipc = require('./app/ipc');

// 1. Keep existing handler working
ipcMain.handle('legacy-channel', legacyHandler);

// 2. Register new organized handler
ipc.registerHandler('modern-channel', modernHandler);

// 3. Create bridge for compatibility
ipc.compatibility.createMigrationBridge(
  'legacy-channel', 
  'modern-channel', 
  modernHandler
);

// 4. Update renderer processes gradually
// 5. Remove legacy handler when migration complete
```

### Safe Handler Registration

Avoid conflicts during migration:

```javascript
const ipc = require('./app/ipc');

// Check if handler already exists
if (!ipc.manager.hasHandler('potentially-duplicate')) {
  ipc.registerHandler('potentially-duplicate', newHandler);
} else {
  console.warn('[Migration] Handler already exists, skipping registration');
}

// Or use compatibility layer for safe registration
ipc.compatibility.safeRegister(
  'safe-channel', 
  handler, 
  'handle', 
  { overwrite: false }
);
```

## Testing Patterns

### Unit Testing Handlers

```javascript
// tests/handlers/userManagement.test.js
const userHandlers = require('../../app/ipc/features/userManagement');

describe('User Management Handlers', () => {
  test('get-user-profile returns user data', async () => {
    const mockEvent = {};
    const userId = 'test-user-123';
    
    const handler = userHandlers['get-user-profile'].handler;
    const result = await handler(mockEvent, userId);
    
    expect(result).toHaveProperty('success', true);
    expect(result.profile).toBeDefined();
  });
});
```

### Integration Testing

```javascript
// tests/integration/ipc-system.test.js
const ipc = require('../../app/ipc');

describe('IPC System Integration', () => {
  beforeEach(() => {
    ipc.initialize();
  });
  
  afterEach(() => {
    ipc.shutdown();
  });
  
  test('module registration and handler access', () => {
    const testHandlers = {
      'test-channel': async () => ({ test: true })
    };
    
    ipc.registerModule('test-module', testHandlers);
    
    expect(ipc.manager.hasHandler('test-channel')).toBe(true);
    
    const status = ipc.getStatus();
    expect(status.registry.moduleCount).toBe(1);
  });
});
```

## Best Practices

### 1. Handler Organization

```javascript
// ✅ Good: Organize by feature/domain
app/ipc/features/
  ├── screenSharing.js
  ├── callManagement.js
  └── notifications.js

app/ipc/core/
  ├── configuration.js
  ├── system.js
  └── authentication.js

// ❌ Avoid: Mixing concerns
app/ipc/
  └── allHandlers.js  // Everything in one file
```

### 2. Channel Naming

```javascript
// ✅ Good: Descriptive, hierarchical names
'screen-sharing/get-sources'
'user/profile/update'
'config/app-settings/get'

// ❌ Avoid: Ambiguous names
'getData'
'update'
'action'
```

### 3. Error Responses

```javascript
// ✅ Good: Consistent error structure
{
  success: false,
  error: 'User not found',
  code: 'USER_NOT_FOUND',
  details: { userId: 'invalid-id' }
}

// ❌ Avoid: Inconsistent error handling
throw new Error('Something broke');  // Hard to handle in renderer
```

### 4. Logging Configuration

```javascript
// ✅ Good: Appropriate logging for handler type
{
  'sensitive-operation': {
    handler: sensitiveHandler,
    options: { 
      logArgs: false,    // Don't log sensitive input
      logResult: false   // Don't log sensitive output
    }
  },
  
  'debug-operation': {
    handler: debugHandler,
    options: { 
      logArgs: true,     // Log for debugging
      logResult: true    // Log for debugging
    }
  }
}
```

### 5. Performance Awareness

```javascript
// ✅ Good: Monitor expensive operations
const expensiveHandler = ipc.wrapHandler('expensive-op', async (event, data) => {
  // Long-running operation
  return await processLargeDataset(data);
});

// ✅ Good: Cache when appropriate
const cachedHandler = async (event, key) => {
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await expensiveComputation(key);
  cache.set(key, result, { ttl: 300000 }); // 5 minute cache
  return result;
};
```

## Debugging and Troubleshooting

### Enable Debug Logging

```javascript
// Register handlers with full logging
ipc.registerHandler('debug-channel', handler, {
  logArgs: true,
  logResult: true
});

// Check system status
const status = ipc.getStatus();
console.log('IPC System Status:', JSON.stringify(status, null, 2));
```

### Performance Analysis

```javascript
// Generate performance report
const report = ipc.benchmark.generateReport();
console.log(report);

// Check specific channel metrics
const channelMetrics = ipc.benchmark.getChannelMetrics('slow-channel');
if (channelMetrics) {
  console.log(`Average time: ${channelMetrics.averageTime}ms`);
  console.log(`Max time: ${channelMetrics.maxTime}ms`);
}
```

### Handler Validation

```javascript
// Validate all registered handlers
const validation = ipc.registry.validateHandlers();
console.log(`Validation: ${validation.valid}/${validation.total} handlers valid`);

if (validation.invalid.length > 0) {
  console.error('Invalid handlers found:', validation.invalid);
}
```

## AsyncAPI Integration

### Update Schema

When adding new handlers, update the AsyncAPI schema:

```yaml
# docs/asyncapi/teams-for-linux-ipc.yaml
channels:
  'user/profile/get':
    description: Retrieve user profile information
    messages:
      request:
        $ref: '#/components/messages/UserProfileRequest'
      response:
        $ref: '#/components/messages/UserProfileResponse'
```

### Generate Documentation

```bash
# Generate updated HTML documentation
npm run asyncapi:generate-docs
```

## Common Patterns

### Configuration Handlers

```javascript
const configHandlers = {
  'config/get': async (event, key) => {
    return appConfig.get(key);
  },
  
  'config/set': async (event, key, value) => {
    appConfig.set(key, value);
    return { success: true };
  },
  
  'config/file-changed': {
    type: 'on',
    handler: () => {
      // Restart app or reload config
      app.relaunch();
      app.exit();
    }
  }
};
```

### Notification Handlers

```javascript
const notificationHandlers = {
  'notification/show': async (event, options) => {
    const notification = new Notification(options);
    notification.show();
    return { success: true };
  },
  
  'notification/sound/play': {
    type: 'on',
    handler: (event, soundType) => {
      playNotificationSound(soundType);
    }
  }
};
```

### Screen Sharing Handlers

```javascript
const screenSharingHandlers = {
  'screen-sharing/get-sources': async (event, options) => {
    const sources = await desktopCapturer.getSources(options);
    return sources;
  },
  
  'screen-sharing/started': {
    type: 'on',
    handler: (event, sourceId) => {
      global.currentScreenShare = sourceId;
      createPreviewWindow(sourceId);
    }
  },
  
  'screen-sharing/stopped': {
    type: 'on',
    handler: () => {
      global.currentScreenShare = null;
      closePreviewWindow();
    }
  }
};
```

This developer guide provides the practical knowledge needed to effectively use the new IPC organization system while maintaining code quality and performance standards.
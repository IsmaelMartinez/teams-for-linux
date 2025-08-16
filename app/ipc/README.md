# IPC Organization System

The IPC Organization System provides a structured approach to managing Inter-Process Communication (IPC) handlers in Teams for Linux while maintaining security and simplicity.

## Overview

This system centralizes IPC event handling without requiring external libraries or compromising Electron's security model. It follows existing JavaScript patterns and integrates with the project's console-based logging system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    IPC Organization System                   │
├─────────────────────────────────────────────────────────────┤
│  index.js          │  Unified interface and system management │
├─────────────────────────────────────────────────────────────┤
│  manager.js        │  Core handler registry and lifecycle     │
│  registry.js       │  Module-based handler organization       │
│  compatibility.js  │  Migration support and conflict detection│
│  benchmark.js      │  Performance monitoring and metrics      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. IPC Manager (`manager.js`)

The core component that wraps Electron's `ipcMain` with additional functionality:

**Features:**
- Handler registration with lifecycle management
- Error handling and logging integration
- Request/response tracking with correlation
- Automatic cleanup and memory management

**Usage:**
```javascript
const ipcManager = require('./manager');

// Initialize the manager
ipcManager.initialize();

// Register a request-response handler
ipcManager.handle('get-config', async (event, options) => {
  return { config: 'data' };
}, { logArgs: true });

// Register an event listener
ipcManager.on('config-changed', (event, data) => {
  console.log('Config changed:', data);
});

// Get handler information
const info = ipcManager.getHandlerInfo();
console.log(`Registered handlers: ${info.length}`);
```

### 2. Handler Registry (`registry.js`)

Provides module-based organization of IPC handlers:

**Features:**
- Group related handlers into modules
- Validation of handler definitions
- Bulk registration and unregistration
- Module lifecycle tracking

**Usage:**
```javascript
const ipcRegistry = require('./registry');

// Define a module with handlers
const configModule = {
  'get-config': {
    type: 'handle',
    handler: async (event) => getConfiguration(),
    options: { logResult: true }
  },
  'config-file-changed': {
    type: 'on',
    handler: (event) => restartApplication()
  }
};

// Register the entire module
ipcRegistry.registerModule('configuration', configModule);

// Get module information
const modules = ipcRegistry.getModuleInfo();
console.log(`Active modules: ${modules.length}`);
```

### 3. Compatibility Layer (`compatibility.js`)

Ensures smooth migration from existing IPC patterns:

**Features:**
- Conflict detection between old and new handlers
- Safe handler registration with overwrite options
- Migration bridges for deprecated channels
- Cleanup of tracked handlers

**Usage:**
```javascript
const ipcCompatibility = require('./compatibility');

// Initialize tracking
ipcCompatibility.initialize();

// Safely register with conflict checking
ipcCompatibility.safeRegister('new-channel', handler, 'handle', { 
  overwrite: false 
});

// Create a migration bridge
ipcCompatibility.createMigrationBridge(
  'old-channel', 
  'new-channel', 
  modernHandler
);
```

### 4. Performance Benchmark (`benchmark.js`)

Monitors IPC handler performance and establishes baselines:

**Features:**
- Handler execution timing
- Performance metrics collection
- Baseline establishment for regression testing
- Detailed reporting capabilities

**Usage:**
```javascript
const ipcBenchmark = require('./benchmark');

// Wrap a handler for timing
const timedHandler = ipcBenchmark.wrapHandler('slow-operation', async (event, data) => {
  // Perform operation
  return result;
});

// Manual timing
const timer = ipcBenchmark.startTiming('manual-operation');
// ... do work ...
timer.end();

// Get performance report
const report = ipcBenchmark.generateReport();
console.log(report);
```

### 5. Unified Interface (`index.js`)

Provides a single entry point to the entire system:

**Features:**
- System initialization and shutdown
- Status monitoring
- Convenience methods for common operations
- Component coordination

**Usage:**
```javascript
const ipc = require('./ipc');

// Initialize the entire system
ipc.initialize();

// Quick handler registration
ipc.registerHandler('quick-channel', handler);
ipc.registerModule('my-module', moduleHandlers);

// Get system status
const status = ipc.getStatus();
console.log(`System health: ${status.manager.handlerCount} handlers active`);

// Performance monitoring
const baseline = ipc.saveBaseline('current-performance');

// Shutdown when done
ipc.shutdown();
```

## Integration with Existing Code

### Console Logging Integration

The system integrates with the project's existing console-based logging:

```javascript
// All components use console with prefixes for identification
console.info('[IPC-Manager] Initializing IPC Manager');
console.debug('[IPC-Registry] Registered module with 5 handlers');
console.warn('[IPC-Compatibility] Deprecated channel used: old-config');
```

### Electron Patterns

Maintains compatibility with existing Electron IPC patterns:

```javascript
// Traditional approach (still works)
ipcMain.handle('old-way', handler);

// Organized approach (new system)
ipc.registerHandler('new-way', handler, { logArgs: true });

// Both approaches coexist during migration
```

## Testing

The system includes comprehensive testing:

### Unit Tests (`tests/manager.test.js`)

Tests core functionality with mocked dependencies:
- Handler registration and removal
- Error handling and logging
- Lifecycle management
- Performance monitoring

### Integration Tests (`../../scripts/test-ipc-system.js`)

End-to-end testing with complete system:
- System initialization
- Module registration
- Performance benchmarking
- Cleanup and shutdown

**Run tests:**
```bash
# Unit tests (requires Jest)
npm test app/ipc/tests/

# Integration test
node scripts/test-ipc-system.js
```

## Migration Guide

### From Scattered Handlers

**Before:**
```javascript
// In app/index.js
ipcMain.handle('get-config', async () => config);
ipcMain.on('config-changed', restartApp);

// In app/screenSharing/index.js  
ipcMain.handle('get-sources', getDesktopSources);
```

**After:**
```javascript
// In app/ipc/core/configuration.js
const configHandlers = {
  'get-config': async () => config,
  'config-changed': { type: 'on', handler: restartApp }
};

// In app/ipc/features/screenSharing.js
const screenSharingHandlers = {
  'get-sources': getDesktopSources
};

// Registration
ipc.registerModule('configuration', configHandlers);
ipc.registerModule('screenSharing', screenSharingHandlers);
```

### Gradual Migration Strategy

1. **Initialize system** alongside existing handlers
2. **Register new handlers** through the organized system
3. **Create migration bridges** for deprecated channels
4. **Remove old handlers** once migration is complete
5. **Update renderer processes** to use new patterns

## Performance Considerations

### Baseline Metrics

The system establishes performance baselines:
- Handler execution time tracking
- Memory usage monitoring
- Call frequency analysis
- Performance regression detection

### Optimization

Built-in optimizations:
- Lazy handler loading
- Efficient event routing
- Memory leak prevention
- Request correlation for debugging

## Security

### No External Dependencies

The system maintains security by:
- Using only built-in Node.js and Electron APIs
- No requirement to disable Electron sandbox
- Following existing project security patterns
- Maintaining process isolation

### Handler Validation

Security features include:
- Input parameter validation (when configured)
- Handler authorization checks
- Error boundary enforcement
- Secure handler lifecycle management

## Future Extensibility

The architecture supports future enhancements:

### Optional Validation (Task 3.0)
- Schema-based parameter validation
- AsyncAPI integration for contracts
- Runtime type checking

### External Integration
- MQTT event publishing
- Webhook notifications
- External monitoring systems

### Advanced Features
- Handler hot-reloading
- Dynamic handler discovery
- Cross-process event routing

## Troubleshooting

### Common Issues

**Handler conflicts:**
```bash
[IPC-Manager] Handler for channel 'duplicate-channel' already registered, overwriting
```
Solution: Use compatibility layer for safe registration

**Performance issues:**
```bash
[IPC-Benchmark] IPC timing for slow-channel: 1250.45ms
```
Solution: Check handler implementation and add caching

**Missing handlers:**
```bash
[IPC-Manager] No handler found for channel 'missing-channel'
```
Solution: Verify handler registration and channel names

### Debug Mode

Enable detailed logging:
```javascript
// Register handlers with logging options
ipc.registerHandler('debug-channel', handler, { 
  logArgs: true, 
  logResult: true 
});
```

### System Status

Check system health:
```javascript
const status = ipc.getStatus();
console.log(JSON.stringify(status, null, 2));
```

## Contributing

When adding new IPC handlers:

1. **Use the organized system** instead of direct ipcMain registration
2. **Group related handlers** into logical modules
3. **Add appropriate logging** for debugging
4. **Include error handling** for robustness
5. **Update AsyncAPI schema** for documentation
6. **Write tests** for new functionality

## Related Documentation

- [AsyncAPI Schema](../docs/asyncapi/teams-for-linux-ipc.yaml)
- [Architecture Decision Record](../docs/adr/001-simplified-ipc-centralization.md)
- [Migration Task List](../tasks/tasks-prd-ipc-centralization.md)
- [Project IPC Documentation](../docs/ipc-api.md)
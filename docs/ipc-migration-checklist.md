# IPC Migration Checklist

This checklist helps developers migrate from the legacy scattered IPC handlers to the new organized IPC system.

## Pre-Migration Assessment

### 1. Identify Current IPC Handlers

- [ ] **Audit main process handlers**
  - [ ] List all `ipcMain.handle()` calls
  - [ ] List all `ipcMain.on()` calls  
  - [ ] List all `ipcMain.once()` calls
  - [ ] Document handler locations and purposes

- [ ] **Audit renderer process calls**
  - [ ] List all `ipcRenderer.invoke()` calls
  - [ ] List all `ipcRenderer.send()` calls
  - [ ] Document expected response formats

- [ ] **Group by functionality**
  - [ ] Configuration-related handlers
  - [ ] Notification handlers
  - [ ] Screen sharing handlers
  - [ ] Call management handlers
  - [ ] System state handlers
  - [ ] Authentication handlers

### 2. Establish Performance Baseline

- [ ] **Run baseline measurement**
  ```bash
  node scripts/test-ipc-system.js
  ```

- [ ] **Document current performance**
  - [ ] Handler response times
  - [ ] Memory usage patterns
  - [ ] Error rates and patterns

## Migration Execution

### Phase 1: System Setup

- [ ] **Initialize IPC organization system**
  ```javascript
  const ipc = require('./app/ipc');
  ipc.initialize();
  ```

- [ ] **Create module directories**
  ```bash
  mkdir -p app/ipc/core
  mkdir -p app/ipc/features
  ```

- [ ] **Set up compatibility layer**
  ```javascript
  ipc.compatibility.initialize();
  ```

### Phase 2: Core Handlers Migration

- [ ] **Configuration handlers** (`app/ipc/core/configuration.js`)
  - [ ] `get-config` handler
  - [ ] `config-file-changed` handler
  - [ ] Configuration validation handlers
  - [ ] Test migrated handlers

- [ ] **System state handlers** (`app/ipc/core/system.js`)
  - [ ] `get-system-idle-state` handler
  - [ ] `user-status-changed` handler
  - [ ] System monitoring handlers
  - [ ] Test migrated handlers

- [ ] **Notification handlers** (`app/ipc/core/notifications.js`)
  - [ ] `show-notification` handler
  - [ ] `play-notification-sound` handler
  - [ ] `set-badge-count` handler
  - [ ] Test migrated handlers

### Phase 3: Feature Handlers Migration

- [ ] **Screen sharing handlers** (`app/ipc/features/screenSharing.js`)
  - [ ] `desktop-capturer-get-sources` handler
  - [ ] `screen-sharing-started` handler
  - [ ] `screen-sharing-stopped` handler
  - [ ] `get-screen-sharing-status` handler
  - [ ] Preview window handlers
  - [ ] Test migrated handlers

- [ ] **Call management handlers** (`app/ipc/features/calls.js`)
  - [ ] `incoming-call-created` handler
  - [ ] `incoming-call-ended` handler
  - [ ] `call-connected` handler
  - [ ] `call-disconnected` handler
  - [ ] Call window management handlers
  - [ ] Test migrated handlers

### Phase 4: Specialized Handlers

- [ ] **Authentication handlers** (`app/ipc/features/authentication.js`)
  - [ ] SSO login handlers
  - [ ] Token management handlers
  - [ ] Test migrated handlers

- [ ] **Menu and tray handlers** (`app/ipc/features/menus.js`)
  - [ ] Tray update handlers
  - [ ] Menu action handlers
  - [ ] Settings backup/restore handlers
  - [ ] Test migrated handlers

## Module Implementation Template

### Create Handler Module

```javascript
// app/ipc/features/exampleModule.js

/**
 * Example Module IPC Handlers
 * 
 * Handles [description of functionality]
 */

const exampleHandlers = {
  'example-get-data': {
    type: 'handle',
    handler: async (event, params) => {
      try {
        const data = await fetchExampleData(params);
        return { success: true, data };
      } catch (error) {
        console.error('[ExampleModule] Failed to fetch data:', error);
        return { success: false, error: error.message };
      }
    },
    options: { logArgs: true, logResult: false }
  },

  'example-event-occurred': {
    type: 'on',
    handler: (event, eventData) => {
      console.info('[ExampleModule] Event occurred:', eventData);
      processExampleEvent(eventData);
    },
    options: { logArgs: true }
  }
};

module.exports = exampleHandlers;
```

### Register Module

```javascript
// In application startup
const ipc = require('./app/ipc');
const exampleHandlers = require('./app/ipc/features/exampleModule');

ipc.registerModule('example-module', exampleHandlers);
```

## Testing Each Migration Step

### 1. Unit Testing

- [ ] **Create test file** for each module
  ```javascript
  // app/ipc/tests/exampleModule.test.js
  const exampleHandlers = require('../features/exampleModule');
  
  describe('Example Module Handlers', () => {
    test('example-get-data returns expected format', async () => {
      const handler = exampleHandlers['example-get-data'].handler;
      const result = await handler({}, { id: 'test' });
      expect(result).toHaveProperty('success');
    });
  });
  ```

### 2. Integration Testing

- [ ] **Test module registration**
  ```javascript
  const ipc = require('./app/ipc');
  ipc.registerModule('test-module', testHandlers);
  
  const status = ipc.getStatus();
  expect(status.registry.moduleCount).toBeGreaterThan(0);
  ```

### 3. Performance Testing

- [ ] **Benchmark migrated handlers**
  ```javascript
  const wrappedHandler = ipc.wrapHandler('test-channel', originalHandler);
  ipc.registerHandler('test-channel', wrappedHandler);
  
  // Run performance tests
  const metrics = ipc.getMetrics();
  ```

## AsyncAPI Schema Updates

### Update Schema for New Handlers

- [ ] **Add channel definitions**
  ```yaml
  # docs/asyncapi/teams-for-linux-ipc.yaml
  channels:
    'new-handler-name':
      description: Description of the handler
      messages:
        request:
          $ref: '#/components/messages/NewHandlerRequest'
        response:
          $ref: '#/components/messages/NewHandlerResponse'
  ```

- [ ] **Define message schemas**
  ```yaml
  components:
    messages:
      NewHandlerRequest:
        payload:
          type: object
          properties:
            param1:
              type: string
              description: Parameter description
  ```

- [ ] **Generate updated documentation**
  ```bash
  npm run asyncapi:generate-docs
  ```

## Compatibility and Migration Bridges

### Create Migration Bridges

- [ ] **For renamed channels**
  ```javascript
  ipc.compatibility.createMigrationBridge(
    'old-channel-name',
    'new-channel-name',
    newHandler
  );
  ```

- [ ] **For changed response formats**
  ```javascript
  const legacyAdapter = async (event, ...args) => {
    const newResult = await newHandler(event, ...args);
    return convertToLegacyFormat(newResult);
  };
  
  ipc.compatibility.safeRegister(
    'legacy-channel',
    legacyAdapter,
    'handle',
    { overwrite: true }
  );
  ```

## Cleanup and Finalization

### Remove Legacy Handlers

- [ ] **Identify unused legacy handlers**
  ```javascript
  const validation = ipc.registry.validateHandlers();
  console.log('Validation results:', validation);
  ```

- [ ] **Remove direct ipcMain registrations**
  - [ ] Remove from `app/index.js`
  - [ ] Remove from feature modules
  - [ ] Update import statements

- [ ] **Update renderer processes**
  - [ ] Update channel names if changed
  - [ ] Update expected response formats
  - [ ] Test all IPC communication paths

### Performance Validation

- [ ] **Compare performance metrics**
  ```javascript
  // Save new baseline
  const newBaseline = ipc.saveBaseline('post-migration');
  
  // Compare with pre-migration baseline
  const report = ipc.benchmark.generateReport();
  console.log(report);
  ```

- [ ] **Verify no regressions**
  - [ ] Response times within acceptable range
  - [ ] Memory usage not significantly increased
  - [ ] Error rates not increased

### Documentation Updates

- [ ] **Update main documentation**
  - [ ] Update `docs/ipc-api.md` with migration notes
  - [ ] Update `app/ipc/README.md` with new handlers
  - [ ] Update `CLAUDE.md` with new patterns

- [ ] **Create migration report**
  - [ ] Handlers migrated count
  - [ ] Performance impact summary
  - [ ] Issues encountered and resolutions

## Rollback Plan

### If Migration Issues Occur

- [ ] **Identify problematic handlers**
  ```javascript
  const status = ipc.getStatus();
  const validation = ipc.registry.validateHandlers();
  ```

- [ ] **Disable organized system**
  ```javascript
  ipc.shutdown();
  // Fall back to legacy handlers
  ```

- [ ] **Document issues**
  - [ ] Error messages and stack traces
  - [ ] Performance metrics comparison
  - [ ] Affected functionality

- [ ] **Create issue tickets**
  - [ ] Bug reports with reproduction steps
  - [ ] Performance regression reports

## Success Criteria

### Migration Complete When:

- [ ] **All handlers migrated**
  - [ ] Zero direct `ipcMain` registrations in application code
  - [ ] All handlers registered through organized system
  - [ ] All modules properly structured

- [ ] **Testing passes**
  - [ ] Unit tests pass for all modules
  - [ ] Integration tests pass
  - [ ] Performance within acceptable bounds

- [ ] **Documentation updated**
  - [ ] AsyncAPI schema complete
  - [ ] Module documentation current
  - [ ] Developer guides updated

- [ ] **No regressions**
  - [ ] All existing functionality works
  - [ ] Performance maintained or improved
  - [ ] Error rates not increased

This checklist ensures a systematic and safe migration to the new IPC organization system while maintaining application stability and performance.
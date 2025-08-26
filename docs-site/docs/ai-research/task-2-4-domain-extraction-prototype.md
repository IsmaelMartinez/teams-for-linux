# Task 2.4: Domain Extraction Prototype - Custom Background Module

*Generated: 2025-01-26*  
*Status: Completed*  
*Related PRD: Architecture Modernization*

## Executive Summary

Proof-of-concept domain extraction of `customBackground` module demonstrates the migration from monolithic patterns to domain-driven architecture. The prototype shows how to separate concerns, encapsulate state, create domain-specific services, and establish proper IPC boundaries using modern Electron patterns inspired by VS Code and Discord architectures.

## Current Module Analysis

### Existing Implementation Issues
```javascript
// app/customBackground/index.js - Current Issues
let customBGServiceUrl;  // Line 6 - Global module variable ❌

class CustomBackground {
  constructor(app, config) {
    // Direct IPC handler registration in constructor ❌
    ipcMain.handle("get-custom-bg-list", this.handleGetCustomBGList); // Line 14
    
    // Direct config dependency ❌
    this.config = config; // Line 11
  }
}
```

**Problems Identified:**
1. **Global state**: `customBGServiceUrl` shared across module
2. **IPC coupling**: Handler registration mixed with business logic
3. **Configuration coupling**: Direct config object dependency
4. **No domain boundaries**: Mixed HTTP service, file management, and IPC concerns

---

## Prototype: UI Support Domain Service

### Domain Service Architecture
```javascript
// app/domains/ui-support/services/CustomBackgroundService.js
const { EventEmitter } = require('events');

class CustomBackgroundService extends EventEmitter {
  #serviceUrl = null;
  #config = null;
  #httpClient = null;
  #fileManager = null;
  
  constructor(dependencies) {
    super();
    this.#config = dependencies.config;
    this.#httpClient = dependencies.httpClient;
    this.#fileManager = dependencies.fileManager;
    
    if (this.#config.isCustomBackgroundEnabled) {
      this.#initialize();
    }
  }

  // Public API - Domain Service Interface
  async getBackgroundList() {
    try {
      return await this.#fileManager.readBackgroundConfig();
    } catch (error) {
      this.emit('error', 'background-list-read-failed', error);
      return [];
    }
  }

  // HTTP Request Interception - Domain Boundary
  handleUrlRedirect(requestDetails) {
    if (!this.#config.isCustomBackgroundEnabled || !this.#serviceUrl) {
      return null;
    }

    const redirectUrl = this.#checkUrlPatterns(requestDetails.url);
    if (redirectUrl) {
      this.emit('url-redirected', { original: requestDetails.url, redirect: redirectUrl });
      return { redirectURL: redirectUrl };
    }
    return null;
  }

  // Internal State Management - Properly Encapsulated
  #initialize() {
    this.#setupServiceUrl();
    this.#downloadRemoteConfig();
  }

  #setupServiceUrl() {
    try {
      this.#serviceUrl = new URL("", this.#config.customBGServiceBaseUrl);
    } catch (error) {
      this.#serviceUrl = new URL("", "http://localhost");
      this.emit('warning', 'service-url-fallback', error);
    }
  }

  #checkUrlPatterns(url) {
    const patterns = [
      'https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/',
      'https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/'
    ];

    for (const pattern of patterns) {
      if (url.startsWith(pattern)) {
        const reqUrl = url.replace(pattern, '');
        return this.#httpClient.joinURLs(this.#serviceUrl.href, reqUrl);
      }
    }
    return null;
  }
}

module.exports = CustomBackgroundService;
```

### Domain IPC Handler
```javascript  
// app/domains/ui-support/handlers/CustomBackgroundHandlers.js
class CustomBackgroundHandlers {
  #service = null;

  constructor(backgroundService) {
    this.#service = backgroundService;
  }

  // IPC Handler Registration - Separated from Business Logic
  registerHandlers(ipcManager) {
    ipcManager.handle('ui-support:get-background-list', async () => {
      return await this.#service.getBackgroundList();
    });

    ipcManager.handle('ui-support:refresh-backgrounds', async () => {
      return await this.#service.refreshRemoteConfig();
    });
  }

  // Domain Event Listeners
  setupEventHandlers() {
    this.#service.on('error', (type, error) => {
      console.error(`CustomBackground ${type}:`, error);
    });

    this.#service.on('url-redirected', ({ original, redirect }) => {
      console.debug(`URL redirect: ${original} -> ${redirect}`);
    });
  }
}

module.exports = CustomBackgroundHandlers;
```

### Configuration Facade Pattern
```javascript
// app/domains/ui-support/config/UiSupportConfig.js
class UiSupportConfigFacade {
  #config = null;

  constructor(appConfig) {
    this.#config = appConfig;
  }

  // UI Support Domain - Only relevant configuration exposed
  get isCustomBackgroundEnabled() {
    return this.#config.isCustomBackgroundEnabled ?? false;
  }

  get customBGServiceBaseUrl() {
    return this.#config.customBGServiceBaseUrl ?? 'http://localhost';
  }

  get customBGServiceConfigFetchInterval() {
    return this.#config.customBGServiceConfigFetchInterval ?? 3600;
  }

  get screenSharingThumbnail() {
    return this.#config.screenSharingThumbnail ?? { enabled: true, alwaysOnTop: true };
  }

  // Configuration changes notification
  onConfigChange(callback) {
    this.#config.onUpdate?.('ui-support', callback);
  }
}

module.exports = UiSupportConfigFacade;
```

### Domain Initialization Pattern
```javascript
// app/domains/ui-support/UiSupportDomain.js
const CustomBackgroundService = require('./services/CustomBackgroundService');
const CustomBackgroundHandlers = require('./handlers/CustomBackgroundHandlers');
const UiSupportConfigFacade = require('./config/UiSupportConfig');

class UiSupportDomain {
  #services = new Map();
  #handlers = new Map();
  #config = null;

  constructor(dependencies) {
    this.#config = new UiSupportConfigFacade(dependencies.appConfig);
    this.#initializeServices(dependencies);
    this.#initializeHandlers(dependencies.ipcManager);
  }

  // Domain Service Management
  #initializeServices(dependencies) {
    // Custom Background Service
    const backgroundService = new CustomBackgroundService({
      config: this.#config,
      httpClient: dependencies.httpClient,
      fileManager: dependencies.fileManager
    });
    this.#services.set('customBackground', backgroundService);

    // Future services: ScreenSharing, Zoom, CustomCSS, etc.
  }

  #initializeHandlers(ipcManager) {
    // Background Handlers
    const backgroundHandlers = new CustomBackgroundHandlers(
      this.#services.get('customBackground')
    );
    backgroundHandlers.registerHandlers(ipcManager);
    backgroundHandlers.setupEventHandlers();
    this.#handlers.set('customBackground', backgroundHandlers);
  }

  // Domain Public Interface
  getService(serviceName) {
    return this.#services.get(serviceName);
  }

  handleHttpRequest(requestDetails) {
    const backgroundService = this.#services.get('customBackground');
    return backgroundService?.handleUrlRedirect(requestDetails);
  }

  // Domain Lifecycle
  async shutdown() {
    for (const service of this.#services.values()) {
      if (service.shutdown) {
        await service.shutdown();
      }
    }
  }
}

module.exports = UiSupportDomain;
```

---

## IPC Modern Pattern Implementation

### VS Code Inspired Service Injection
```javascript
// app/core/ipc/IpcManager.js - Centralized IPC Management
class IpcManager {
  #handlers = new Map();
  #mainProcess = null;

  constructor(mainProcess) {
    this.#mainProcess = mainProcess;
  }

  // Domain-Namespaced Handler Registration
  handle(channel, handler) {
    if (this.#handlers.has(channel)) {
      throw new Error(`IPC handler already registered: ${channel}`);
    }

    this.#handlers.set(channel, handler);
    this.#mainProcess.ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        console.error(`IPC Handler Error [${channel}]:`, error);
        throw error;
      }
    });
  }

  // Event-based Communication
  send(channel, data) {
    // Send to focused renderer or all renderers
    this.#mainProcess.webContents.getAllWebContents()
      .forEach(webContents => {
        if (!webContents.isDestroyed()) {
          webContents.send(channel, data);
        }
      });
  }

  // Cleanup
  removeHandler(channel) {
    if (this.#handlers.has(channel)) {
      this.#mainProcess.ipcMain.removeHandler(channel);
      this.#handlers.delete(channel);
    }
  }
}

module.exports = IpcManager;
```

### Discord-Inspired Event System
```javascript
// app/core/events/DomainEventBus.js
class DomainEventBus {
  #subscribers = new Map();

  // Domain-to-Domain Communication
  subscribe(eventType, callback, domain) {
    if (!this.#subscribers.has(eventType)) {
      this.#subscribers.set(eventType, []);
    }
    
    this.#subscribers.get(eventType).push({
      callback,
      domain,
      id: Date.now() + Math.random()
    });
  }

  // Async Event Emission
  async emit(eventType, data, sourceDomain) {
    const subscribers = this.#subscribers.get(eventType) || [];
    
    const promises = subscribers
      .filter(sub => sub.domain !== sourceDomain) // No self-notification
      .map(async sub => {
        try {
          return await sub.callback(data, sourceDomain);
        } catch (error) {
          console.error(`Event handler error [${eventType}]:`, error);
        }
      });

    return await Promise.allSettled(promises);
  }

  unsubscribe(eventType, subscriberId) {
    const subscribers = this.#subscribers.get(eventType) || [];
    this.#subscribers.set(eventType, 
      subscribers.filter(sub => sub.id !== subscriberId)
    );
  }
}

module.exports = DomainEventBus;
```

---

## Migration Validation Results

### Before vs After Comparison

#### State Management
```javascript
// BEFORE - Global module variable
let customBGServiceUrl; // Shared across all instances

// AFTER - Properly encapsulated
class CustomBackgroundService {
  #serviceUrl = null; // Private, instance-specific
}
```

#### IPC Handler Organization  
```javascript
// BEFORE - Mixed with constructor
constructor(app, config) {
  ipcMain.handle("get-custom-bg-list", this.handleGetCustomBGList);
}

// AFTER - Separated domain handlers
class CustomBackgroundHandlers {
  registerHandlers(ipcManager) {
    ipcManager.handle('ui-support:get-background-list', async () => {
      return await this.#service.getBackgroundList();
    });
  }
}
```

#### Configuration Access
```javascript
// BEFORE - Direct coupling
this.config = config; // Full config object access

// AFTER - Domain facade
this.#config = new UiSupportConfigFacade(appConfig);
// Only UI Support relevant config exposed
```

### Validation Metrics

| Aspect | Before | After | Improvement |
|--------|---------|-------|-------------|
| **Global State** | 1 module variable | 0 global variables | ✅ Eliminated |
| **IPC Coupling** | Direct registration | Domain service pattern | ✅ Separated |
| **Config Access** | Full object | Domain facade | ✅ Controlled |
| **Error Handling** | Try-catch scattered | Event-based system | ✅ Centralized |
| **Testability** | Difficult (global state) | Easy (dependency injection) | ✅ Improved |
| **Domain Boundaries** | Mixed concerns | Clear separation | ✅ Established |

---

## Lessons Learned from Research Application

### VS Code Patterns Applied
1. **Service Injection**: Dependencies injected via constructor
2. **Layer Separation**: Clear boundaries between service, handler, and configuration layers
3. **Namespaced IPC**: Domain-prefixed channel names (`ui-support:get-background-list`)

### Discord Patterns Applied  
1. **Event-Driven Communication**: Services emit events for cross-domain coordination
2. **Asynchronous Operations**: All operations are promise-based
3. **Modular Design**: Each service is independently testable and maintainable

### Electron Best Practices Applied
1. **Context Bridge Pattern**: Secure IPC communication boundaries
2. **Process Isolation**: Services don't directly access global state
3. **Error Boundaries**: Proper error handling with domain-specific logging

---

## Migration Roadmap for Other Modules

### Low Complexity (Similar to Custom Background)
- `customCSS` - UI theme management
- `incomingCallToast` - Notification UI component
- `login` - Authentication dialog

### Medium Complexity  
- `cacheManager` - Background service with file operations
- `connectionManager` - Network status with event coordination
- `spellCheckProvider` - Language service integration

### High Complexity
- `mainAppWindow` - Central coordinator requiring full decomposition
- `screenSharing` - Complex UI coordination and global state
- `menus` - System integration with multiple domain concerns

---

## Next Steps for Full Implementation

1. **Create domain directory structure** following VS Code patterns
2. **Implement IpcManager and EventBus** core services  
3. **Extract configuration facades** for each domain
4. **Migrate low-complexity modules first** to validate patterns
5. **Establish testing framework** for domain isolation validation

---

*This prototype validates the feasibility of domain-driven architecture migration using modern Electron patterns and research-informed best practices.*
# Phase 1 Architecture Implementation Plan

**Project**: Teams for Linux Architecture Modernization
**Phase**: 1 - Core Architecture Foundation
**Status**: In Progress (Partial Implementation Detected)
**Version**: 3.0.0-beta.1
**Author**: System Architecture Designer
**Date**: 2025-11-03

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Phase 1 Architecture Design](#phase-1-architecture-design)
4. [Component Specifications](#component-specifications)
5. [Interface Contracts](#interface-contracts)
6. [Architecture Diagrams](#architecture-diagrams)
7. [Implementation Plan](#implementation-plan)
8. [Risk Assessment](#risk-assessment)
9. [Testing Strategy](#testing-strategy)
10. [Success Criteria](#success-criteria)

---

## Executive Summary

### Objective
Establish the core architecture foundation for Teams for Linux 3.0 by implementing the orchestration layer, event system, and plugin management infrastructure. This phase transforms the monolithic 711-line `app/index.js` into a clean, maintainable architecture with clear separation of concerns.

### Current Status
**Partial Implementation Detected**: Core component files exist in the codebase:
- ✅ `app/core/EventBus.js` - EXISTS
- ✅ `app/core/Application.js` - EXISTS
- ✅ `app/core/PluginManager.js` - EXISTS
- ✅ `app/plugins/BasePlugin.js` - EXISTS
- ✅ `app/plugins/PluginAPI.js` - EXISTS

**Action Required**: Review existing implementations, identify gaps, complete missing functionality, and ensure alignment with architecture requirements.

### Key Deliverables
1. **Application Orchestrator** (`core/Application.js`) - Thin startup/shutdown coordinator (<100 lines)
2. **Event Bus** (`core/EventBus.js`) - Cross-domain pub/sub communication
3. **Plugin Manager** (`core/PluginManager.js`) - Plugin lifecycle and dependency resolution
4. **Base Plugin Class** (`plugins/BasePlugin.js`) - Abstract plugin with lifecycle hooks
5. **Plugin API** (`plugins/PluginAPI.js`) - Sandboxed API surface for plugins
6. **Refactored Index** (`app/index.js`) - Reduced to orchestration only (<100 lines)

### Architecture Principles
1. **Single Responsibility**: Each component has one clear purpose
2. **Dependency Injection**: Dependencies passed explicitly, not accessed globally
3. **Event-Driven Communication**: Loose coupling via EventBus
4. **Fail-Safe Design**: Robust error handling prevents cascade failures
5. **Zero Breaking Changes**: All existing IPC channels and functionality preserved

### Timeline
- **Duration**: 1.5 weeks (Phase 1)
- **Effort**: ~60 hours engineering time
- **Risk Level**: Low (foundation work, no existing code modifications)

---

## Current State Analysis

### Existing Architecture (app/index.js - 711 lines)

#### Responsibilities Identified
The current `index.js` file handles 11 distinct concerns:

```javascript
// 1. ELECTRON LIFECYCLE (lines 80-298)
app.on('second-instance', ...);
app.on('ready', handleAppReady);
app.on('quit', ...);
app.on('render-process-gone', onRenderProcessGone);
app.on('certificate-error', handleCertificateError);

// 2. CONFIGURATION MANAGEMENT (lines 24-36)
const appConfig = new AppConfiguration(app.getPath('userData'), app.getVersion());
const config = appConfig.startupConfig;

// 3. GLOBAL STATE MANAGEMENT (lines 50-52)
let userStatus = -1;
let idleTimeUserStatus = -1;
let picker = null;

// 4. IPC HANDLER REGISTRATION (lines 116-294)
ipcMain.handle('get-config', async () => { return config; });
ipcMain.handle('get-system-idle-state', handleGetSystemIdleState);
ipcMain.handle('desktop-capturer-get-sources', (_event, opts) => ...);
// ... 50+ more IPC handlers

// 5. SCREEN SHARING COORDINATION (lines 146-219)
ipcMain.on('screen-sharing-started', (event, sourceId) => { ... });
ipcMain.on('screen-sharing-stopped', () => { ... });
globalThis.selectedScreenShareSource = null;

// 6. NOTIFICATION SYSTEM (lines 407-488)
async function showNotification(_event, options) { ... }
async function playNotificationSound(_event, options) { ... }

// 7. COMMAND LINE SWITCHES (lines 310-405)
function addCommandLineSwitchesBeforeConfigLoad() { ... }
function addCommandLineSwitchesAfterConfigLoad() { ... }

// 8. CERTIFICATE HANDLING (lines 649-660)
function handleCertificateError() { ... }

// 9. PERMISSION MANAGEMENT (lines 662-675)
async function requestMediaAccess() { ... }

// 10. GLOBAL SHORTCUT MANAGEMENT (lines 687-704)
function handleGlobalShortcutDisabled() { ... }
function handleGlobalShortcutDisabledRevert() { ... }

// 11. NAVIGATION HANDLERS (lines 272-294)
ipcMain.on('navigate-back', (event) => { ... });
ipcMain.on('navigate-forward', (event) => { ... });
```

#### Critical Patterns to Preserve

**1. IPC Security Wrapper Pattern** (lines 93-114):
```javascript
const originalIpcHandle = ipcMain.handle.bind(ipcMain);
const originalIpcOn = ipcMain.on.bind(ipcMain);

ipcMain.handle = (channel, handler) => {
  return originalIpcHandle(channel, (event, ...args) => {
    if (!validateIpcChannel(channel, args.length > 0 ? args[0] : null)) {
      console.error(`[IPC Security] Rejected handle request for channel: ${channel}`);
      return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
    }
    return handler(event, ...args);
  });
};
```
**Architectural Decision**: This security pattern MUST be preserved in the new architecture. The Application class should apply this wrapper during initialization.

**2. Configuration Immutability Pattern**:
```javascript
// Configuration loaded once at startup
const appConfig = new AppConfiguration(app.getPath("userData"), app.getVersion());
const config = appConfig.startupConfig;
// config is immutable - changes only via AppConfiguration methods
```
**Architectural Decision**: Configuration Domain (Phase 3) will maintain this pattern. Core architecture should not modify configuration.

**3. Global State via globalThis** (screen sharing):
```javascript
globalThis.selectedScreenShareSource = sourceId;
globalThis.previewWindow = ...;
```
**Architectural Decision**: StateManager (Phase 3) will replace these globals. For Phase 1, we preserve them temporarily.

**4. Module Initialization Dependencies**:
```javascript
// CacheManager depends on config
if (config.cacheManagement?.enabled) {
  const cacheManager = new CacheManager({ ... });
  cacheManager.start();
}

// MainAppWindow depends on appConfig and customBackground
mainAppWindow.onAppReady(appConfig, new CustomBackground(app, config));
```
**Architectural Decision**: Application orchestrator must respect initialization order.

### Existing Modules Analysis

#### Strong Architectural Patterns Found

**AppConfiguration Class** (`app/appConfiguration/index.js`):
- ✅ Uses WeakMap for true private fields (no #property syntax dependency)
- ✅ Immutable public interface
- ✅ Clear separation: startup config vs. persistent stores
- ✅ Well-documented with JSDoc comments
- **Pattern to Replicate**: This is exemplary encapsulation for Phase 1 components

**IPC Security Validation** (`app/security/ipcValidator.js`):
- ✅ Centralized allowlist of 63 legitimate IPC channels
- ✅ Prototype pollution prevention
- ✅ Clear validation function signature
- **Integration Point**: PluginManager must use this for plugin IPC registration

#### Module Dependencies Discovered

**Critical Initialization Order**:
```
1. Configuration (AppConfiguration)
   ↓
2. Infrastructure (CacheManager, Logger)
   ↓
3. Shell (MainAppWindow, TrayManager)
   ↓
4. Teams Integration (ReactBridge, TokenCache)
   ↓
5. Features (Plugins)
```

**Cross-Module Communication**:
- `mainAppWindow.show()` - Called from notifications and tray
- `app.relaunch()` / `app.exit()` - Called from config file watcher
- Global `mainAppWindow` reference - Used by multiple modules
- IPC channels - 50+ channels spanning all modules

### Gap Analysis: What's Missing for Phase 1 Completion

#### 1. Core Components Implementation Gap
**Status Review Required**:
- [ ] Read `app/core/EventBus.js` - Verify pub/sub implementation
- [ ] Read `app/core/Application.js` - Check orchestration logic
- [ ] Read `app/core/PluginManager.js` - Validate lifecycle management
- [ ] Read `app/plugins/BasePlugin.js` - Review abstract class design
- [ ] Read `app/plugins/PluginAPI.js` - Check sandboxing approach

#### 2. Integration with Existing Code
**Missing Pieces**:
- [ ] `app/index.js` refactoring to use Application class
- [ ] IPC security wrapper integration into PluginManager
- [ ] Configuration injection into core components
- [ ] Error handling and recovery mechanisms
- [ ] Graceful shutdown coordination

#### 3. Testing Infrastructure
**Not Yet Implemented**:
- [ ] Unit tests for core components (target: 90%+ coverage)
- [ ] Integration tests for Application lifecycle
- [ ] Plugin lifecycle tests (load, activate, deactivate)
- [ ] EventBus stress tests (many subscribers, event ordering)

---

## Phase 1 Architecture Design

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   app/index.js                       │   │
│  │              (Thin Entry Point <100 lines)           │   │
│  │                                                       │   │
│  │  1. Load configuration                                │   │
│  │  2. Create Application instance                       │   │
│  │  3. Start application                                 │   │
│  │  4. Handle process signals                            │   │
│  └────────────┬─────────────────────────────────────────┘   │
│               │                                               │
│               ↓                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            core/Application.js                       │   │
│  │          (Application Orchestrator)                   │   │
│  │                                                       │   │
│  │  • Manages initialization sequence                    │   │
│  │  • Coordinates domain lifecycle                       │   │
│  │  • Orchestrates plugin loading                        │   │
│  │  • Handles graceful shutdown                          │   │
│  └───┬──────────────┬───────────────┬─────────────────┘   │
│      │              │               │                       │
│      ↓              ↓               ↓                       │
│  ┌────────┐  ┌─────────────┐  ┌──────────────┐            │
│  │EventBus│  │PluginManager│  │ Domains (2-5)│            │
│  │        │  │             │  │              │            │
│  └────────┘  └─────────────┘  └──────────────┘            │
│      │              │                                       │
│      │              ↓                                       │
│      │      ┌──────────────────┐                           │
│      │      │   BasePlugin     │                           │
│      │      │   PluginAPI      │                           │
│      │      └──────────────────┘                           │
│      │              │                                       │
│      └──────────────┴───────────────────────────────────┐  │
│                                                          │  │
│      ┌───────────────────────────────────────────────┐  │  │
│      │           Plugin Ecosystem                     │  │  │
│      │  (Phase 6+: Notifications, ScreenSharing...)  │  │  │
│      └───────────────────────────────────────────────┘  │  │
│                                                          │  │
└──────────────────────────────────────────────────────────┴──┘
```

### Component Relationships

```
Electron App
    │
    └──> index.js (entry point)
            │
            └──> Application.js (orchestrator)
                    │
                    ├──> EventBus.js (communication backbone)
                    │       │
                    │       └──> Pub/Sub for cross-component events
                    │
                    ├──> PluginManager.js (plugin lifecycle)
                    │       │
                    │       ├──> BasePlugin.js (abstract class)
                    │       │       │
                    │       │       └──> Concrete plugins extend this
                    │       │
                    │       └──> PluginAPI.js (sandboxed API)
                    │               │
                    │               └──> config, ipc, events, windows, teams
                    │
                    └──> Domain Initialization (Phases 2-5)
                            │
                            ├──> Infrastructure Domain (Phase 2)
                            ├──> Configuration Domain (Phase 3)
                            ├──> Shell Domain (Phase 4)
                            └──> Teams Integration Domain (Phase 5)
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Startup Sequence                         │
└─────────────────────────────────────────────────────────────┘

1. Electron Ready Event
        ↓
2. index.js loads AppConfiguration
        ↓
3. index.js creates Application(config)
        ↓
4. Application.start() begins initialization
        ↓
5. Apply IPC security wrappers
        ↓
6. Initialize EventBus (singleton)
        ↓
7. Initialize PluginManager(eventBus, config)
        ↓
8. Load core plugins (Phase 6+)
        ↓
9. Emit 'app:ready' event
        ↓
10. Existing modules subscribe to events
        ↓
11. Application running


┌─────────────────────────────────────────────────────────────┐
│                    Plugin Lifecycle Flow                     │
└─────────────────────────────────────────────────────────────┘

1. PluginManager.loadPlugin(path)
        ↓
2. Read and validate manifest.json
        ↓
3. Require plugin's main entry point
        ↓
4. Check dependencies (other plugins)
        ↓
5. Create plugin instance with PluginAPI
        ↓
6. Call plugin.onActivate()
        ↓
7. Register plugin IPC handlers (validated)
        ↓
8. Subscribe to events via EventBus
        ↓
9. Store plugin in registry
        ↓
10. Emit 'plugin:loaded' event


┌─────────────────────────────────────────────────────────────┐
│                    Event Communication Flow                  │
└─────────────────────────────────────────────────────────────┘

Component A              EventBus              Component B
    │                       │                       │
    ├──> emit('event', data)                       │
    │                       │                       │
    │                  [routing logic]              │
    │                       │                       │
    │                       ├──> notify subscribers │
    │                       │                       │
    │                       │   <──── on('event')───┤
    │                       │                       │
    │                  handler(data) ───────────────>
    │                       │                       │
```

---

## Component Specifications

### 1. Application Orchestrator (`core/Application.js`)

#### Purpose
Thin coordination layer that manages application lifecycle, initializes domains in correct order, and orchestrates plugin loading without implementing business logic.

#### Responsibilities
- ✅ Initialize core systems (EventBus, configuration injection)
- ✅ Coordinate domain initialization in dependency order
- ✅ Delegate plugin management to PluginManager
- ✅ Handle graceful shutdown
- ✅ Emit lifecycle events for observers
- ❌ NO business logic (window management, IPC handling, etc.)

#### API Surface

```javascript
class Application {
  /**
   * Creates the application orchestrator
   * @param {Object} options - Configuration options
   * @param {AppConfiguration} options.appConfig - Application configuration
   * @param {Object} options.electronApp - Electron app instance
   */
  constructor({ appConfig, electronApp })

  /**
   * Initializes and starts the application
   * Coordinates domain and plugin initialization
   * @returns {Promise<void>}
   * @throws {Error} If critical initialization fails
   */
  async start()

  /**
   * Gracefully shuts down the application
   * Ensures cleanup of all resources
   * @returns {Promise<void>}
   */
  async shutdown()

  /**
   * Gets the EventBus instance for external subscribers
   * @returns {EventBus}
   */
  getEventBus()

  /**
   * Gets the PluginManager instance
   * @returns {PluginManager}
   */
  getPluginManager()
}
```

#### Internal Structure

```javascript
class Application {
  #config;
  #electronApp;
  #eventBus;
  #pluginManager;
  #domains;
  #state; // 'initializing', 'ready', 'shutting-down', 'stopped'

  constructor({ appConfig, electronApp }) {
    this.#config = appConfig.startupConfig;
    this.#electronApp = electronApp;
    this.#eventBus = new EventBus();
    this.#domains = new Map();
    this.#state = 'initializing';
  }

  async start() {
    try {
      console.log('[Application] Starting initialization sequence');

      // Step 1: Apply security wrappers
      this.#applyIpcSecurityWrappers();

      // Step 2: Initialize EventBus (already created in constructor)
      this.#eventBus.emit('app:initializing', { timestamp: Date.now() });

      // Step 3: Create PluginManager
      this.#pluginManager = new PluginManager({
        eventBus: this.#eventBus,
        config: this.#config
      });

      // Step 4: Initialize domains (Phases 2-5)
      // await this.#initializeDomains(); // Deferred to later phases

      // Step 5: Load core plugins (Phase 6+)
      // await this.#pluginManager.loadCorePlugins(); // Deferred to Phase 6

      // Step 6: Mark as ready
      this.#state = 'ready';
      this.#eventBus.emit('app:ready', { timestamp: Date.now() });

      console.log('[Application] Initialization complete');
    } catch (error) {
      console.error('[Application] Failed to start:', error);
      this.#eventBus.emit('app:error', { error });
      throw error;
    }
  }

  async shutdown() {
    if (this.#state === 'shutting-down' || this.#state === 'stopped') {
      return; // Already shutting down
    }

    this.#state = 'shutting-down';
    this.#eventBus.emit('app:shutdown-started', { timestamp: Date.now() });

    try {
      // Unload plugins
      if (this.#pluginManager) {
        await this.#pluginManager.unloadAllPlugins();
      }

      // Shutdown domains (reverse order)
      for (const [name, domain] of Array.from(this.#domains.entries()).reverse()) {
        console.log(`[Application] Shutting down domain: ${name}`);
        await domain.shutdown?.();
      }

      this.#state = 'stopped';
      this.#eventBus.emit('app:stopped', { timestamp: Date.now() });
    } catch (error) {
      console.error('[Application] Error during shutdown:', error);
      this.#eventBus.emit('app:shutdown-error', { error });
    }
  }

  #applyIpcSecurityWrappers() {
    const { ipcMain } = require('electron');
    const { validateIpcChannel } = require('../security/ipcValidator');

    // Wrap ipcMain.handle
    const originalHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (channel, handler) => {
      return originalHandle(channel, (event, ...args) => {
        if (!validateIpcChannel(channel, args[0])) {
          return Promise.reject(new Error(`Unauthorized IPC: ${channel}`));
        }
        return handler(event, ...args);
      });
    };

    // Wrap ipcMain.on
    const originalOn = ipcMain.on.bind(ipcMain);
    ipcMain.on = (channel, handler) => {
      return originalOn(channel, (event, ...args) => {
        if (!validateIpcChannel(channel, args[0])) {
          console.error(`[IPC Security] Blocked: ${channel}`);
          return;
        }
        return handler(event, ...args);
      });
    };

    console.log('[Application] IPC security wrappers applied');
  }

  getEventBus() {
    return this.#eventBus;
  }

  getPluginManager() {
    return this.#pluginManager;
  }
}

module.exports = Application;
```

#### Key Design Decisions

**Decision 1**: Use private fields (#property) for internal state
- **Rationale**: Prevents external tampering, enforces encapsulation
- **Alternative Considered**: WeakMap pattern (used in AppConfiguration)
- **Trade-off**: Requires Node 12+, but project already uses Node 22

**Decision 2**: Inject dependencies via constructor
- **Rationale**: Explicit dependencies, easier testing
- **Alternative Considered**: Global singletons (current pattern)
- **Trade-off**: More verbose, but clearer intent

**Decision 3**: Emit events for lifecycle milestones
- **Rationale**: Allows external observation without tight coupling
- **Alternative Considered**: Callbacks passed to constructor
- **Trade-off**: Events are fire-and-forget, no guaranteed execution

### 2. Event Bus (`core/EventBus.js`)

#### Purpose
Provides decoupled pub/sub communication between domains, plugins, and core components without direct dependencies.

#### Responsibilities
- ✅ Register event listeners with namespaces
- ✅ Emit events with arbitrary payloads
- ✅ Support wildcard subscriptions (e.g., 'shell.*')
- ✅ Provide event history for debugging
- ✅ Handle listener errors gracefully (don't crash on bad handler)
- ❌ NO message queuing (synchronous delivery)
- ❌ NO event persistence (in-memory only)

#### API Surface

```javascript
class EventBus {
  /**
   * Subscribe to an event
   * @param {string} event - Event name (supports wildcards: 'shell.*')
   * @param {Function} handler - Callback function (event, data) => void
   * @returns {Function} Unsubscribe function
   */
  on(event, handler)

  /**
   * Subscribe to an event (one-time only)
   * @param {string} event - Event name
   * @param {Function} handler - Callback function
   * @returns {Function} Unsubscribe function
   */
  once(event, handler)

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} handler - Handler to remove
   */
  off(event, handler)

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {any} data - Event payload
   */
  emit(event, data)

  /**
   * Get event history for debugging (last 100 events)
   * @returns {Array<{event: string, timestamp: number, data: any}>}
   */
  getHistory()

  /**
   * Clear all listeners (useful for testing)
   */
  clear()
}
```

#### Implementation Requirements

**Event Naming Convention**:
```
<domain>:<entity>:<action>
Examples:
  - app:ready
  - shell:window:created
  - shell:tray:updated
  - config:changed
  - plugin:notifications:loaded
  - teams:token:refreshed
```

**Wildcard Support**:
```javascript
eventBus.on('shell:*', handler); // All shell events
eventBus.on('*', handler);       // All events (use sparingly)
```

**Error Isolation**:
```javascript
emit(event, data) {
  const handlers = this.#getHandlersFor(event);
  for (const handler of handlers) {
    try {
      handler(event, data);
    } catch (error) {
      console.error(`[EventBus] Handler error for ${event}:`, error);
      // Don't throw - isolate handler errors
    }
  }
}
```

#### Performance Characteristics
- **Subscription**: O(1) - Map-based storage
- **Emission**: O(n) where n = number of subscribers for event
- **Wildcard Matching**: O(m) where m = total subscriptions (acceptable for <1000 handlers)
- **Memory**: History limited to last 100 events to prevent unbounded growth

### 3. Plugin Manager (`core/PluginManager.js`)

#### Purpose
Manages plugin lifecycle including loading, activation, deactivation, dependency resolution, and cleanup.

#### Responsibilities
- ✅ Load plugins from manifest files
- ✅ Validate plugin manifests and permissions
- ✅ Resolve plugin dependencies (load order)
- ✅ Activate plugins with lifecycle hooks
- ✅ Deactivate plugins cleanly
- ✅ Provide sandboxed PluginAPI to plugins
- ✅ Isolate plugin errors (don't crash app)
- ❌ NO plugin discovery (paths provided explicitly)
- ❌ NO hot reloading (requires app restart)

#### API Surface

```javascript
class PluginManager {
  /**
   * Creates plugin manager
   * @param {Object} options
   * @param {EventBus} options.eventBus - Event bus instance
   * @param {Object} options.config - Application configuration
   */
  constructor({ eventBus, config })

  /**
   * Load a plugin from its manifest path
   * @param {string} manifestPath - Absolute path to manifest.json
   * @returns {Promise<void>}
   * @throws {Error} If plugin invalid or activation fails
   */
  async loadPlugin(manifestPath)

  /**
   * Load all core plugins from app/plugins/core/
   * @returns {Promise<void>}
   */
  async loadCorePlugins()

  /**
   * Unload a specific plugin
   * @param {string} pluginId - Plugin identifier
   * @returns {Promise<void>}
   */
  async unloadPlugin(pluginId)

  /**
   * Unload all plugins (shutdown sequence)
   * @returns {Promise<void>}
   */
  async unloadAllPlugins()

  /**
   * Get list of loaded plugins
   * @returns {Array<{id, name, version, state}>}
   */
  getLoadedPlugins()

  /**
   * Get plugin by ID
   * @param {string} pluginId
   * @returns {Object|null} Plugin metadata and instance
   */
  getPlugin(pluginId)
}
```

#### Plugin Manifest Schema

```json
{
  "id": "string (required) - Unique identifier",
  "name": "string (required) - Display name",
  "version": "string (required) - Semver version",
  "description": "string (optional) - Plugin description",
  "requires": {
    "teams-for-linux": "string (required) - Semver range"
  },
  "dependencies": {
    "pluginId": "version range (optional) - Other plugins required"
  },
  "permissions": [
    "string (required) - List of required permissions",
    "Valid values: ipc, notifications, audio, windows, teams-integration, filesystem"
  ],
  "main": "string (required) - Entry point (index.js)",
  "preload": "string (optional) - Renderer preload script"
}
```

#### Dependency Resolution Algorithm

```javascript
// Topological sort for plugin load order
#resolveDependencies(plugins) {
  const graph = new Map();
  const inDegree = new Map();

  // Build dependency graph
  for (const plugin of plugins) {
    graph.set(plugin.id, plugin.dependencies || {});
    inDegree.set(plugin.id, 0);
  }

  // Count in-degrees
  for (const [id, deps] of graph) {
    for (const depId of Object.keys(deps)) {
      inDegree.set(depId, (inDegree.get(depId) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue = [];
  const sorted = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);

    for (const neighbor of Object.keys(graph.get(current))) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== plugins.length) {
    throw new Error('Circular dependency detected in plugins');
  }

  return sorted; // Load in this order
}
```

### 4. Base Plugin Class (`plugins/BasePlugin.js`)

#### Purpose
Abstract base class that all plugins extend, providing lifecycle hooks and API access.

#### API Surface

```javascript
class BasePlugin {
  /**
   * Constructor receives sandboxed API
   * @param {PluginAPI} api - Sandboxed plugin API
   */
  constructor(api)

  /**
   * Called when plugin is activated
   * Plugin should register IPC handlers, subscribe to events
   * @returns {Promise<void>}
   * @abstract - Subclasses MUST implement
   */
  async onActivate()

  /**
   * Called when plugin is deactivated
   * Plugin should cleanup resources, unregister handlers
   * @returns {Promise<void>}
   * @abstract - Subclasses MUST implement
   */
  async onDeactivate()

  /**
   * Called when configuration changes
   * @param {Object} newConfig - Updated configuration
   * @returns {Promise<void>}
   * @optional - Subclasses MAY implement
   */
  async onConfigChange(newConfig)

  /**
   * Called when main window is ready
   * @param {BrowserWindow} window - Main application window
   * @returns {Promise<void>}
   * @optional - Subclasses MAY implement
   */
  async onWindowReady(window)

  /**
   * Get plugin metadata (id, name, version)
   * @returns {Object}
   * @final - Do not override
   */
  getMetadata()
}
```

#### Usage Example

```javascript
// plugins/core/notifications/index.js
const { BasePlugin } = require('../../BasePlugin');

class NotificationsPlugin extends BasePlugin {
  constructor(api) {
    super(api);
    this.soundManager = null;
  }

  async onActivate() {
    // Register IPC handlers
    this.api.ipc.handle('show-notification', this.#showNotification.bind(this));
    this.api.ipc.handle('play-notification-sound', this.#playSound.bind(this));

    // Subscribe to events
    this.api.events.on('user:status-changed', this.#handleStatusChange.bind(this));

    // Initialize resources
    this.soundManager = new SoundManager(this.api.config.get('notificationSound'));

    console.log('[NotificationsPlugin] Activated');
  }

  async onDeactivate() {
    // Unregister IPC handlers
    this.api.ipc.removeHandler('show-notification');
    this.api.ipc.removeHandler('play-notification-sound');

    // Unsubscribe from events
    this.api.events.off('user:status-changed', this.#handleStatusChange);

    // Cleanup resources
    this.soundManager?.cleanup();

    console.log('[NotificationsPlugin] Deactivated');
  }

  async #showNotification(event, { title, body, icon }) {
    // Implementation
  }

  async #playSound(event, { type }) {
    // Implementation
  }

  #handleStatusChange(event, status) {
    // Update notification behavior based on user status
  }
}

module.exports = NotificationsPlugin;
```

### 5. Plugin API (`plugins/PluginAPI.js`)

#### Purpose
Provides sandboxed access to application capabilities based on plugin permissions. Acts as facade over internal systems.

#### Capabilities by Permission

```javascript
/**
 * PluginAPI provides controlled access to application systems
 * Access is granted based on plugin manifest permissions
 */
class PluginAPI {
  constructor(plugin, permissions, systemAPIs) {
    this._pluginId = plugin.id;
    this._permissions = new Set(permissions);

    // Core APIs (always available)
    this.events = systemAPIs.eventBus; // EventBus instance
    this.config = this._createConfigAPI(systemAPIs.config);

    // Permission-gated APIs
    if (this._permissions.has('ipc')) {
      this.ipc = this._createIpcAPI(systemAPIs.ipcMain);
    }

    if (this._permissions.has('windows')) {
      this.windows = this._createWindowsAPI(systemAPIs.windowManager);
    }

    if (this._permissions.has('teams-integration')) {
      this.teams = this._createTeamsAPI(systemAPIs.teamsIntegration);
    }

    if (this._permissions.has('notifications')) {
      this.notifications = this._createNotificationsAPI();
    }
  }

  // Core APIs (always available)
  events: {
    on(event, handler),
    once(event, handler),
    off(event, handler),
    emit(event, data) // Plugins can emit namespaced events
  }

  config: {
    get(key),           // Get scoped config value
    set(key, value),    // Set scoped config value
    scoped(prefix)      // Get scoped config namespace
  }

  // IPC API (requires 'ipc' permission)
  ipc: {
    handle(channel, handler),   // Register IPC handler
    removeHandler(channel),     // Unregister IPC handler
    send(channel, data)         // Send IPC message to renderer
  }

  // Windows API (requires 'windows' permission)
  windows: {
    getMain(),                  // Get main BrowserWindow
    create(options),            // Create new window
    close(windowId),            // Close window
    show(windowId),             // Show window
    hide(windowId)              // Hide window
  }

  // Teams Integration API (requires 'teams-integration' permission)
  teams: {
    injectScript(script),           // Inject script into Teams web view
    onReactReady(callback),         // Called when React is ready
    getTokenCache()                 // Get token cache (async)
  }

  // Notifications API (requires 'notifications' permission)
  notifications: {
    show(options),              // Show system notification
    playSound(soundFile)        // Play notification sound
  }
}
```

#### Permission Validation

```javascript
_createIpcAPI(ipcMain) {
  const pluginId = this._pluginId;

  return {
    handle(channel, handler) {
      // Namespace plugin channels to prevent conflicts
      const namespacedChannel = `plugin:${pluginId}:${channel}`;

      // IPC validation already applied by Application
      ipcMain.handle(namespacedChannel, handler);
    },

    removeHandler(channel) {
      const namespacedChannel = `plugin:${pluginId}:${channel}`;
      ipcMain.removeHandler(namespacedChannel);
    },

    send(channel, data) {
      const namespacedChannel = `plugin:${pluginId}:${channel}`;
      // Get main window and send
      const mainWindow = require('../mainAppWindow');
      mainWindow.webContents?.send(namespacedChannel, data);
    }
  };
}
```

---

## Interface Contracts

### EventBus Events (Standard Events)

```typescript
// Application Lifecycle Events
'app:initializing'       → { timestamp: number }
'app:ready'              → { timestamp: number }
'app:shutdown-started'   → { timestamp: number }
'app:stopped'            → { timestamp: number }
'app:error'              → { error: Error }

// Plugin Lifecycle Events
'plugin:loading'         → { pluginId: string, manifest: Object }
'plugin:loaded'          → { pluginId: string }
'plugin:activating'      → { pluginId: string }
'plugin:activated'       → { pluginId: string }
'plugin:deactivating'    → { pluginId: string }
'plugin:deactivated'     → { pluginId: string }
'plugin:error'           → { pluginId: string, error: Error }

// Configuration Events (Phase 3)
'config:changed'         → { key: string, oldValue: any, newValue: any }
'config:reloaded'        → { config: Object }

// Shell Events (Phase 4)
'shell:window:created'   → { windowId: number, type: string }
'shell:window:closed'    → { windowId: number }
'shell:tray:updated'     → { icon: string, badge: number }

// Teams Integration Events (Phase 5)
'teams:react:ready'      → { timestamp: number }
'teams:token:refreshed'  → { timestamp: number }
'teams:login:success'    → { userId: string }
```

### IPC Channel Contracts

**Plugin IPC Channel Naming**:
```
plugin:<pluginId>:<channel>

Examples:
  plugin:notifications:show
  plugin:notifications:play-sound
  plugin:screen-sharing:start
  plugin:screen-sharing:stop
```

**Security Validation**:
All plugin IPC channels must pass through `validateIpcChannel` and be added to the allowlist during plugin activation.

---

## Architecture Diagrams

### Sequence Diagram: Application Startup

```
┌──────┐  ┌────────┐  ┌───────────┐  ┌────────┐  ┌──────────────┐  ┌────────┐
│Electron│ │index.js│ │Application│ │EventBus│ │PluginManager │ │ Plugin │
└───┬────┘ └───┬────┘ └─────┬─────┘ └───┬────┘ └──────┬───────┘ └───┬────┘
    │          │            │            │             │              │
    │ ready    │            │            │             │              │
    ├─────────>│            │            │             │              │
    │          │            │            │             │              │
    │          │ new Application(config)│             │              │
    │          ├───────────>│            │             │              │
    │          │            │            │             │              │
    │          │ start()    │            │             │              │
    │          ├───────────>│            │             │              │
    │          │            │            │             │              │
    │          │            │ applyIpcSecurity()       │              │
    │          │            ├──────┐     │             │              │
    │          │            │      │     │             │              │
    │          │            │<─────┘     │             │              │
    │          │            │            │             │              │
    │          │            │ emit('app:initializing') │              │
    │          │            ├───────────>│             │              │
    │          │            │            │             │              │
    │          │            │ new PluginManager()      │              │
    │          │            ├────────────────────────>│              │
    │          │            │            │             │              │
    │          │            │ loadCorePlugins()        │              │
    │          │            ├────────────────────────>│              │
    │          │            │            │             │              │
    │          │            │            │             │ loadPlugin() │
    │          │            │            │             ├─────────────>│
    │          │            │            │             │              │
    │          │            │            │             │ new Plugin() │
    │          │            │            │             ├──────┐       │
    │          │            │            │             │      │       │
    │          │            │            │             │<─────┘       │
    │          │            │            │             │              │
    │          │            │            │             │ onActivate() │
    │          │            │            │             ├─────────────>│
    │          │            │            │             │              │
    │          │            │            │             │<─────────────┤
    │          │            │            │             │              │
    │          │            │            │ emit('plugin:loaded')      │
    │          │            │            │<────────────┤              │
    │          │            │            │             │              │
    │          │            │ emit('app:ready')        │              │
    │          │            ├───────────>│             │              │
    │          │            │            │             │              │
    │          │<───────────┤            │             │              │
    │          │            │            │             │              │
```

### Sequence Diagram: Plugin Lifecycle

```
┌──────────────┐  ┌────────┐  ┌───────────┐
│PluginManager │  │EventBus│  │  Plugin   │
└──────┬───────┘  └───┬────┘  └─────┬─────┘
       │              │              │
       │ loadPlugin(path)            │
       ├──────┐       │              │
       │      │       │              │
       │ 1. Read manifest.json       │
       │      │       │              │
       │<─────┘       │              │
       │              │              │
       │ 2. Validate manifest        │
       ├──────┐       │              │
       │      │       │              │
       │<─────┘       │              │
       │              │              │
       │ 3. Require plugin module    │
       ├──────┐       │              │
       │      │       │              │
       │<─────┘       │              │
       │              │              │
       │ 4. Create PluginAPI         │
       ├──────┐       │              │
       │      │       │              │
       │<─────┘       │              │
       │              │              │
       │ 5. new Plugin(api)          │
       ├────────────────────────────>│
       │              │              │
       │              │ plugin instance
       │<─────────────────────────────┤
       │              │              │
       │ 6. onActivate()             │
       ├────────────────────────────>│
       │              │              │
       │              │     7. Register IPC
       │              │     8. Subscribe events
       │              │              │
       │<─────────────────────────────┤
       │              │              │
       │ emit('plugin:loaded')       │
       ├─────────────>│              │
       │              │              │

       ... Plugin Running ...

       │ unloadPlugin(id)            │
       ├──────┐       │              │
       │      │       │              │
       │<─────┘       │              │
       │              │              │
       │ onDeactivate()              │
       ├────────────────────────────>│
       │              │              │
       │              │     9. Cleanup IPC
       │              │     10. Unsubscribe
       │              │              │
       │<─────────────────────────────┤
       │              │              │
       │ emit('plugin:unloaded')     │
       ├─────────────>│              │
       │              │              │
```

### State Machine: Application States

```
┌────────────────────────────────────────────────────────────┐
│                    Application State Machine                │
└────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │              │
         start()    │ Initializing │
              ┌────>│              │
              │     └──────┬───────┘
              │            │
┌─────────┐   │            │ Initialization Complete
│         │   │            │
│ Stopped │───┘            ↓
│         │            ┌───────┐
└────┬────┘            │       │
     ↑                 │ Ready │◄───┐
     │                 │       │    │
     │                 └───┬───┘    │
     │                     │        │
     │     shutdown()      │        │ Plugin reload
     │                     ↓        │
     │             ┌────────────────┴┐
     │             │                 │
     └─────────────│ Shutting Down  │
                   │                 │
                   └─────────────────┘

States:
  - Stopped: Initial state, not running
  - Initializing: Loading domains and plugins
  - Ready: Fully operational, accepting events
  - Shutting Down: Cleaning up resources

Transitions:
  - start(): Stopped → Initializing
  - init complete: Initializing → Ready
  - shutdown(): Ready → Shutting Down
  - cleanup complete: Shutting Down → Stopped
```

---

## Implementation Plan

### Completion Checklist

#### Phase 1.1: Review Existing Implementation (Day 1)
- [ ] Read and analyze `app/core/EventBus.js`
  - [ ] Verify pub/sub implementation
  - [ ] Check wildcard support
  - [ ] Review error handling
  - [ ] Validate event history feature
- [ ] Read and analyze `app/core/Application.js`
  - [ ] Verify orchestration logic
  - [ ] Check IPC security wrapper application
  - [ ] Review domain initialization (if implemented)
  - [ ] Validate lifecycle management
- [ ] Read and analyze `app/core/PluginManager.js`
  - [ ] Verify plugin loading mechanism
  - [ ] Check dependency resolution
  - [ ] Review lifecycle hooks
  - [ ] Validate error isolation
- [ ] Read and analyze `app/plugins/BasePlugin.js`
  - [ ] Verify abstract class pattern
  - [ ] Check lifecycle hook definitions
  - [ ] Review metadata handling
- [ ] Read and analyze `app/plugins/PluginAPI.js`
  - [ ] Verify permission sandboxing
  - [ ] Check API surface completeness
  - [ ] Review namespacing for IPC channels

#### Phase 1.2: Gap Analysis and Planning (Day 2)
- [ ] Document gaps in existing implementation
- [ ] Create list of missing features
- [ ] Identify integration points with index.js
- [ ] Plan testing strategy
- [ ] Design migration path for index.js refactoring

#### Phase 1.3: Complete Missing Functionality (Days 3-5)
- [ ] Implement missing EventBus features
  - [ ] Wildcard event matching
  - [ ] Event history with configurable limit
  - [ ] Performance optimization
- [ ] Complete Application orchestrator
  - [ ] IPC security wrapper integration
  - [ ] Graceful shutdown sequence
  - [ ] Error recovery mechanisms
- [ ] Finalize PluginManager
  - [ ] Dependency resolution algorithm
  - [ ] Plugin state persistence
  - [ ] Core plugin discovery
- [ ] Enhance BasePlugin
  - [ ] Add optional lifecycle hooks
  - [ ] Implement metadata getter
- [ ] Complete PluginAPI
  - [ ] Permission-based API gating
  - [ ] IPC channel namespacing
  - [ ] Scoped configuration access

#### Phase 1.4: Refactor app/index.js (Days 6-7)
- [ ] Extract concerns from index.js
  - [ ] Move IPC handlers to temporary holding area
  - [ ] Preserve global state temporarily (Phase 3 replacement)
  - [ ] Keep existing functionality intact
- [ ] Integrate Application class
  - [ ] Replace inline initialization with Application.start()
  - [ ] Wire up configuration injection
  - [ ] Add shutdown handler
- [ ] Verify backward compatibility
  - [ ] All existing IPC channels work
  - [ ] No functional regressions
  - [ ] Startup sequence unchanged

#### Phase 1.5: Testing and Validation (Days 8-10)
- [ ] Unit Tests (Target: 90%+ coverage)
  - [ ] EventBus: subscription, emission, wildcards, error handling
  - [ ] Application: initialization, shutdown, error recovery
  - [ ] PluginManager: loading, dependencies, activation, errors
  - [ ] BasePlugin: lifecycle hooks, metadata
  - [ ] PluginAPI: permission gating, namespacing
- [ ] Integration Tests
  - [ ] Application startup sequence end-to-end
  - [ ] Plugin lifecycle (load, activate, deactivate)
  - [ ] EventBus cross-component communication
  - [ ] IPC security validation
- [ ] E2E Tests
  - [ ] Existing Playwright tests pass
  - [ ] No startup time regression
  - [ ] All features functional

### Daily Task Breakdown

**Day 1**: Audit and Assessment
- Morning: Read EventBus.js, Application.js
- Afternoon: Read PluginManager.js, BasePlugin.js, PluginAPI.js
- Evening: Document findings, create gap analysis

**Day 2**: Planning and Design
- Morning: Complete gap analysis
- Afternoon: Design missing features
- Evening: Write test plan

**Day 3**: EventBus Implementation
- Morning: Implement wildcard matching
- Afternoon: Add event history
- Evening: Write EventBus unit tests

**Day 4**: Application Orchestrator
- Morning: IPC security integration
- Afternoon: Shutdown sequence
- Evening: Write Application unit tests

**Day 5**: PluginManager Completion
- Morning: Dependency resolution algorithm
- Afternoon: Error isolation improvements
- Evening: Write PluginManager unit tests

**Day 6**: Index.js Refactoring Part 1
- Morning: Extract IPC handlers
- Afternoon: Integrate Application class
- Evening: Test startup sequence

**Day 7**: Index.js Refactoring Part 2
- Morning: Wire configuration injection
- Afternoon: Add shutdown handling
- Evening: Validate backward compatibility

**Day 8**: Unit Testing
- Morning: Complete remaining unit tests
- Afternoon: Achieve 90%+ coverage
- Evening: Fix failing tests

**Day 9**: Integration Testing
- Morning: Application lifecycle tests
- Afternoon: Plugin lifecycle tests
- Evening: Cross-component integration tests

**Day 10**: E2E Testing and Validation
- Morning: Run existing Playwright tests
- Afternoon: Validate no regressions
- Evening: Performance benchmarking

---

## Risk Assessment

### Risk Matrix

| Risk | Probability | Impact | Severity | Mitigation |
|------|------------|--------|----------|------------|
| Existing implementation incomplete | High | Medium | **Medium** | Day 1 audit identifies gaps early |
| IPC security wrapper breaks channels | Low | High | **Medium** | Comprehensive IPC tests, rollback plan |
| Plugin lifecycle bugs | Medium | Medium | **Medium** | Extensive error handling, plugin isolation |
| Performance regression | Low | Medium | **Low** | Benchmark before/after, lazy loading |
| Index.js refactoring breaks features | Medium | High | **High** | Incremental changes, continuous testing |
| EventBus memory leak | Low | High | **Medium** | Event history limit, weak references |

### Risk Mitigation Strategies

#### Risk 1: Existing Implementation Incomplete
**Likelihood**: High (files exist but may lack features)
**Impact**: Medium (delays completion, requires additional work)
**Severity**: Medium

**Mitigation**:
- Day 1 comprehensive code audit
- Compare implementation against specifications
- Document gaps immediately
- Adjust timeline if significant work required

**Contingency**:
- Extend Phase 1 by 2-3 days if gaps substantial
- Defer advanced features (wildcards, history) to Phase 1.5
- Focus on core functionality first

#### Risk 2: IPC Security Wrapper Breaks Channels
**Likelihood**: Low (well-tested pattern from existing code)
**Impact**: High (breaks all IPC communication)
**Severity**: Medium

**Mitigation**:
- Preserve exact existing IPC security pattern from index.js
- Test every IPC channel individually
- Add integration tests for IPC validation
- Keep rollback branch before refactoring

**Contingency**:
- Revert to original index.js IPC pattern
- Investigate wrapper issues in isolation
- Apply wrapper incrementally, not all at once

#### Risk 3: Index.js Refactoring Breaks Features
**Likelihood**: Medium (complex file with many concerns)
**Impact**: High (user-facing functionality breaks)
**Severity**: High

**Mitigation**:
- Incremental refactoring: extract one concern at a time
- Run E2E tests after each change
- Keep original index.js as backup
- Use feature flags for gradual rollout

**Contingency**:
- Immediate rollback if E2E tests fail
- Revert to original index.js
- Investigate failures in isolation before retry

#### Risk 4: EventBus Memory Leak
**Likelihood**: Low (limited history, no persistence)
**Impact**: High (memory grows unbounded)
**Severity**: Medium

**Mitigation**:
- Limit event history to 100 events (circular buffer)
- Use weak references for removed listeners
- Add memory monitoring tests
- Implement clear() method for testing

**Contingency**:
- Reduce history limit to 50 or disable entirely
- Add aggressive garbage collection hints
- Profile memory usage during long runs

### Rollback Plan

**Trigger Conditions**:
- E2E tests fail after refactoring
- Performance regression >10%
- Critical IPC channel breaks
- Plugin system causes crashes

**Rollback Procedure**:
1. Stop deployment
2. Revert to original index.js
3. Remove Application integration
4. Restore original initialization sequence
5. Run full test suite
6. Document failure reasons

**Recovery Timeline**: 1 hour to restore working state

---

## Testing Strategy

### Test Pyramid

```
           ┌─────────────┐
           │   E2E (5%)  │  ← Existing Playwright tests
           └─────────────┘
         ┌───────────────────┐
         │ Integration (15%) │  ← Phase 1 focus
         └───────────────────┘
    ┌─────────────────────────────┐
    │      Unit Tests (80%)       │  ← Primary testing layer
    └─────────────────────────────┘
```

### Unit Testing (Target: 90%+ Coverage)

#### EventBus Tests (`tests/unit/core/EventBus.test.js`)

```javascript
describe('EventBus', () => {
  describe('Basic Pub/Sub', () => {
    it('should allow subscribing to events');
    it('should emit events to all subscribers');
    it('should support multiple handlers per event');
    it('should allow unsubscribing from events');
    it('should support once() for one-time subscriptions');
  });

  describe('Wildcard Support', () => {
    it('should match wildcard subscriptions (shell:*)');
    it('should match global wildcard (*)');
    it('should not match unrelated namespaces');
  });

  describe('Error Handling', () => {
    it('should isolate handler errors (not throw)');
    it('should continue emitting to other handlers on error');
    it('should log handler errors');
  });

  describe('Event History', () => {
    it('should record emitted events');
    it('should limit history to 100 events');
    it('should return history in chronological order');
  });

  describe('Memory Management', () => {
    it('should not leak memory with many subscriptions');
    it('should cleanup removed listeners');
    it('should clear all listeners on clear()');
  });
});
```

#### Application Tests (`tests/unit/core/Application.test.js`)

```javascript
describe('Application', () => {
  describe('Initialization', () => {
    it('should create EventBus on construction');
    it('should apply IPC security wrappers on start()');
    it('should initialize PluginManager');
    it('should emit app:ready when complete');
  });

  describe('Lifecycle', () => {
    it('should transition from initializing to ready');
    it('should handle shutdown gracefully');
    it('should unload all plugins on shutdown');
    it('should emit lifecycle events');
  });

  describe('Error Handling', () => {
    it('should emit app:error on initialization failure');
    it('should not crash on plugin load errors');
    it('should rollback on critical errors');
  });

  describe('API Access', () => {
    it('should provide EventBus via getEventBus()');
    it('should provide PluginManager via getPluginManager()');
  });
});
```

#### PluginManager Tests (`tests/unit/core/PluginManager.test.js`)

```javascript
describe('PluginManager', () => {
  describe('Plugin Loading', () => {
    it('should load plugin from manifest path');
    it('should validate manifest schema');
    it('should reject invalid manifests');
    it('should require plugin module');
  });

  describe('Dependency Resolution', () => {
    it('should resolve plugin dependencies');
    it('should load plugins in correct order');
    it('should detect circular dependencies');
    it('should fail fast on missing dependencies');
  });

  describe('Plugin Lifecycle', () => {
    it('should create plugin instance with PluginAPI');
    it('should call onActivate()');
    it('should store plugin in registry');
    it('should emit plugin:loaded event');
    it('should call onDeactivate() on unload');
    it('should cleanup on deactivation');
  });

  describe('Error Isolation', () => {
    it('should not crash app on plugin activation error');
    it('should mark plugin as failed on error');
    it('should emit plugin:error event');
    it('should continue loading other plugins');
  });
});
```

#### BasePlugin Tests (`tests/unit/plugins/BasePlugin.test.js`)

```javascript
describe('BasePlugin', () => {
  describe('Abstract Class', () => {
    it('should not be instantiable directly');
    it('should allow subclass instantiation');
    it('should require onActivate() implementation');
    it('should require onDeactivate() implementation');
  });

  describe('Lifecycle Hooks', () => {
    it('should call onActivate() when activated');
    it('should call onDeactivate() when deactivated');
    it('should call onConfigChange() when config changes');
    it('should call onWindowReady() when window ready');
  });

  describe('API Access', () => {
    it('should receive PluginAPI in constructor');
    it('should access API via this.api');
    it('should not expose API externally');
  });
});
```

#### PluginAPI Tests (`tests/unit/plugins/PluginAPI.test.js`)

```javascript
describe('PluginAPI', () => {
  describe('Core APIs', () => {
    it('should always provide events API');
    it('should always provide config API');
    it('should scope config to plugin namespace');
  });

  describe('Permission Gating', () => {
    it('should provide ipc API only with ipc permission');
    it('should provide windows API only with windows permission');
    it('should provide teams API only with teams-integration permission');
    it('should provide notifications API only with notifications permission');
  });

  describe('IPC Namespacing', () => {
    it('should namespace plugin IPC channels');
    it('should prevent channel conflicts');
    it('should validate channels through ipcValidator');
  });

  describe('Config Scoping', () => {
    it('should isolate plugin config');
    it('should not allow access to other plugin config');
    it('should support nested config keys');
  });
});
```

### Integration Testing

#### Application Lifecycle Integration (`tests/integration/core/application-lifecycle.test.js`)

```javascript
describe('Application Lifecycle Integration', () => {
  it('should start application successfully');
  it('should load core plugins after initialization');
  it('should emit all lifecycle events in order');
  it('should shutdown cleanly on SIGTERM');
  it('should handle restart (shutdown + start)');
});
```

#### Plugin Communication Integration (`tests/integration/plugins/plugin-communication.test.js`)

```javascript
describe('Plugin Communication Integration', () => {
  it('should allow plugins to communicate via EventBus');
  it('should deliver events to wildcard subscribers');
  it('should handle plugin IPC handlers');
  it('should validate IPC channels through security layer');
});
```

### E2E Testing

**Existing Playwright Tests** (`tests/e2e/`):
- ✅ Application launch
- ✅ Microsoft login redirect
- ✅ Configuration loading
- ✅ Window creation

**Additional E2E Tests for Phase 1**:
- [ ] Application starts with core architecture
- [ ] No performance regression (startup time <5% variance)
- [ ] All existing IPC channels functional
- [ ] Configuration still loads correctly

### Test Execution

**Commands**:
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests
npm test

# Coverage report
npm run test:coverage
```

**Coverage Thresholds**:
```json
{
  "coverageThreshold": {
    "global": {
      "statements": 90,
      "branches": 85,
      "functions": 90,
      "lines": 90
    }
  }
}
```

---

## Success Criteria

### Phase 1 Completion Checklist

#### Functional Requirements
- [x] Core components exist (EventBus, Application, PluginManager, BasePlugin, PluginAPI)
- [ ] Core components fully implemented per specifications
- [ ] `app/index.js` refactored to <100 lines
- [ ] Application orchestrator coordinates initialization
- [ ] IPC security wrappers applied correctly
- [ ] Plugin lifecycle management works (load, activate, deactivate)
- [ ] All existing functionality preserved (no regressions)

#### Quality Requirements
- [ ] Unit test coverage ≥90% for core components
- [ ] Integration tests pass for Application lifecycle
- [ ] All existing E2E tests pass
- [ ] No performance regression (startup time ±5%)
- [ ] No memory leaks detected
- [ ] Code follows project style guide

#### Documentation Requirements
- [ ] Architecture Decision Records created (ADR-004, ADR-005, ADR-006, ADR-007)
- [ ] Component interfaces documented
- [ ] Plugin API reference complete
- [ ] Migration guide from monolithic to orchestrated architecture

#### Acceptance Criteria
1. ✅ Application starts successfully using new architecture
2. ✅ EventBus delivers events reliably
3. ✅ PluginManager loads plugins without errors
4. ✅ All IPC channels functional
5. ✅ Configuration loads and applies correctly
6. ✅ Shutdown sequence executes cleanly
7. ✅ Tests pass consistently (no flakiness)
8. ✅ Code reviewed and approved by maintainers

### Phase 1 Definition of Done

**A phase is complete when**:
1. All functional requirements implemented
2. All tests pass (unit, integration, E2E)
3. Code coverage meets thresholds
4. Documentation updated
5. Code reviewed and merged to feature branch
6. No known critical bugs
7. Performance validated (no regressions)

---

## Next Steps

### Immediate Actions (Day 1)
1. ✅ Read existing core component implementations
2. ✅ Document current implementation state
3. ✅ Identify gaps and missing features
4. ✅ Create detailed gap analysis report

### Week 1 Focus
1. Complete missing EventBus features
2. Finalize Application orchestrator
3. Complete PluginManager dependency resolution
4. Write comprehensive unit tests

### Week 2 Focus
1. Refactor `app/index.js` incrementally
2. Integration testing
3. E2E validation
4. Documentation updates

### Phase 2 Preparation
1. Design Infrastructure Domain structure
2. Plan Logger, CacheManager, NetworkMonitor migration
3. Define domain public APIs
4. Prepare domain testing strategy

---

## Appendix A: Existing Code Patterns

### Pattern 1: WeakMap Private Fields (from AppConfiguration)
```javascript
let _AppConfiguration_configPath = new WeakMap();

class AppConfiguration {
  constructor(configPath) {
    _AppConfiguration_configPath.set(this, configPath);
  }

  get configPath() {
    return _AppConfiguration_configPath.get(this);
  }
}
```

**Usage**: For Node.js <12 compatibility
**Phase 1 Approach**: Use modern #private fields (Node 22 available)

### Pattern 2: IPC Security Wrapper (from index.js)
```javascript
const originalIpcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => {
  return originalIpcHandle(channel, (event, ...args) => {
    if (!validateIpcChannel(channel, args[0])) {
      return Promise.reject(new Error(`Unauthorized: ${channel}`));
    }
    return handler(event, ...args);
  });
};
```

**Usage**: Security layer for all IPC communication
**Phase 1 Approach**: Apply in Application.start(), preserve pattern exactly

### Pattern 3: Module Export (from existing modules)
```javascript
module.exports = {
  onAppReady: function(appConfig, customBackground) {
    // Implementation
  },
  show: function() {
    // Implementation
  }
};
```

**Usage**: Standard CommonJS module pattern
**Phase 1 Approach**: Continue using CommonJS, not ES6 modules

---

## Appendix B: Key Architectural Decisions

### ADR-004: Hybrid DDD + Plugin Architecture
**Status**: Accepted
**Context**: Need organizational clarity AND extensibility
**Decision**: Combine Domain-Driven Design with internal plugin system
**Consequences**: Medium learning curve, both approaches must be understood

### ADR-005: Internal Plugin-Only for v3.0
**Status**: Accepted
**Context**: External plugins add security and API stability concerns
**Decision**: v3.0 MVP has internal plugins only, external deferred to v3.1+
**Consequences**: Simpler implementation, community contributions limited

### ADR-006: Stay with JavaScript
**Status**: Accepted
**Context**: TypeScript migration adds complexity during refactoring
**Decision**: Remain on JavaScript, use JSDoc for type hints
**Consequences**: Less type safety, faster development velocity

### ADR-007: StateManager for Global State
**Status**: Proposed (Phase 3)
**Context**: Global variables (userStatus, screenSharingActive) scattered across code
**Decision**: Centralize state in StateManager service with EventBus notifications
**Consequences**: Requires Phase 3 implementation, temporary globals in Phase 1

---

**Document Status**: Complete - Ready for Implementation Review
**Last Updated**: 2025-11-03
**Next Review**: After Day 1 code audit completion

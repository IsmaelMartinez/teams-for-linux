# Architecture Modernization Research (DDD+Plugin Approach)

:::danger ARCHIVED - PLAN NOT ADOPTED
**Status**: Archived - Research complete but plan deemed too complex

**Date Created**: 2025-10-30
**Date Archived**: 2025-11-08

**Reason**: After critical analysis, this DDD+Plugin approach was determined to be over-engineered for the actual problems in the codebase:
- 10-week big-bang migration of all 35 modules (too risky)
- 8+ new abstractions introduced (PluginManager, EventBus, etc.)
- Over-engineered for actual pain points (374 lines extractable with minimal risk)
- Implementation paralysis (plan so big, nothing was started)

**See instead**: [Incremental Refactoring Plan](./incremental-refactoring-plan.md) - The adopted approach that delivers 49% reduction in index.js with lower risk through incremental extraction (4-8 weeks vs 10 weeks, continuous delivery vs all-or-nothing).

This document is preserved as reference and for historical context.
:::

**Issue**: [#1799 - Architecture Modernization](https://github.com/IsmaelMartinez/teams-for-linux/issues/1799) (Closed)
**Created**: 2025-10-30
**Status**: ~~Research Phase~~ **ARCHIVED**

## Executive Summary

### Current State
Teams for Linux is a mature Electron application with 35 modules (19 main process modules + 15 browser tools + security module) wrapping Microsoft Teams web interface. The codebase demonstrates strong engineering practices including comprehensive security documentation, IPC validation, and modular structure. However, the 711-line `app/index.js` file has become a maintenance bottleneck, mixing concerns across shell management, application lifecycle, Teams integration, and feature coordination.

### Key Findings
1. **Existing Strengths**: The project already implements many industry best practices including secure IPC patterns, context isolation planning, comprehensive research documentation, and modular organization.

2. **Primary Challenge**: Not architectural deficiency but organizational complexity. The monolithic main file coordinates too many concerns without clear domain boundaries.

3. **Critical Constraint**: Must maintain DOM access to Microsoft Teams web interface for core functionality (token cache, notifications, React internal access). This constraint eliminates pure context isolation approaches.

### Recommended Approach
**Hybrid Architecture**: Domain-Driven Design for organizational clarity + Internal Plugin System for extensibility

- **DDD Bounded Contexts**: Organize code into 5 clear domains (Shell, Core, Teams Integration, Features, Infrastructure)
- **Internal Plugins**: Convert existing modules to plugin architecture with lifecycle management
- **Preserve Patterns**: Maintain security practices and DOM access capabilities
- **Phased Migration**: 10-week incremental refactoring using strangler fig pattern

### Expected Benefits
- **Maintainability**: Clear domain boundaries reduce cognitive load
- **Extensibility**: Plugin system enables feature development without core changes
- **Testing**: Isolated domains improve unit test coverage
- **Onboarding**: New contributors understand codebase structure faster
- **Performance**: No runtime overhead, purely organizational improvement

### Risk Level
**Low-Medium**: Phased approach with continuous testing minimizes risk. Critical constraint (DOM access) is preserved throughout migration.

---

## Current Architecture Analysis

### Repository Structure
```
teams-for-linux/
├── app/
│   ├── index.js (711 lines - main process orchestrator)
│   ├── appConfiguration/ (configuration management)
│   ├── mainAppWindow/ (BrowserWindow management)
│   ├── browser/
│   │   ├── tools/ (14 renderer process tools)
│   │   ├── notifications/ (notification management)
│   │   └── preload.js (renderer bridge)
│   ├── security/ (IPC validation)
│   └── [16 main process modules]/
├── docs-site/ (Docusaurus documentation)
└── tests/e2e/ (Playwright tests)
```

### Module Inventory (35 Modules Total)

#### Main Process Modules (19)
**Configuration & Shell:**
- appConfiguration - Centralized config using AppConfiguration class
- config - Logger and configuration utilities
- mainAppWindow - Primary BrowserWindow wrapper
- menus - Application menu management

**Authentication & Security:**
- certificate - Certificate handling
- login - SSO login window
- intune - Microsoft Intune integration
- security - IPC validation (ipcValidator)

**Features:**
- customBackground - Custom background images
- customCSS - Style injection
- documentationWindow - In-app documentation viewer
- globalShortcuts - System-wide keyboard shortcuts
- gpuInfoWindow - GPU diagnostics window (chrome://gpu)
- incomingCallToast - Toast notifications for incoming calls
- screenSharing - Desktop capture and stream selection
- spellCheckProvider - Spell checking integration

**Infrastructure:**
- cacheManager - Cache management
- connectionManager - Network/connection status monitoring
- helpers - Utility functions

#### Browser/Renderer Process Tools (15)
**Teams Integration:**
- reactHandler - DOM injection for React internals access
- tokenCache - Authentication token management
- settings - Settings synchronization
- activityHub - User activity tracking

**UI Enhancements:**
- theme - Theme management and switching
- trayIconRenderer - System tray icon updates
- trayIconChooser - Tray icon selection logic
- mutationTitle - Title bar modification
- zoom - Display scaling

**Audio/Video:**
- disableAutogain - Audio control for professional setups
- wakeLock - Prevent system sleep during calls

**Utilities:**
- emulatePlatform - Platform emulation
- navigationButtons - Back/forward navigation buttons in Teams UI
- shortcuts - Keyboard shortcuts
- timestampCopyOverride - Timestamp copy behavior

### Current State Management Patterns

**Global State (index.js):**
```javascript
let userStatus = -1;
let idleTimeUserStatus = -1;
let screenSharingActive = false;
let currentScreenShareSourceId = null;
```

**IPC Communication:**
- 50+ IPC channels documented in `docs/ipc-api.md`
- Mix of `ipcMain.handle` (request-response) and `ipcMain.on` (fire-and-forget)
- Centralized validation in some modules, ad-hoc in others

**Critical DOM Injection Pattern (reactHandler.js):**
```javascript
// 1. Domain Validation
if (!allowedDomains.includes(hostname)) return;

// 2. React Structure Detection
const reactRoot = element._reactRootContainer?._internalRoot
                  || element[Object.keys(element).find(key => key.startsWith('__react'))];

// 3. Navigate React Internals
const coreServices = reactRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
```

This pattern enables:
- Token cache extraction for authentication persistence
- Notification intercepting for system integration
- Activity status monitoring for tray icon updates

**Security Model:**
- `contextIsolation: false` to enable DOM access (documented trade-off)
- CSP headers for web content restrictions
- IPC validation for cross-process communication
- Allowlist validation before DOM access

### Existing Documentation
The project maintains comprehensive research documentation:
- `automated-testing-strategy.md` - Playwright E2E testing approach
- `dom-access-investigation.md` - Security implications of DOM injection
- `electron-38-migration-analysis.md` - Framework upgrade path
- `secure-storage-research.md` - Credential storage patterns
- `token-cache-authentication-research.md` - Authentication bridge analysis
- `ui-system-strategic-analysis.md` - Interface architecture

---

## Architecture Research Findings

### Domain-Driven Design (DDD) Analysis

#### Identified Bounded Contexts

**1. Shell Context**
- **Responsibility**: Electron framework lifecycle and window management
- **Core Aggregates**:
  - Application (startup/shutdown)
  - MainWindow (window lifecycle, navigation)
  - TrayIcon (system tray integration)
- **Dependencies**: None (pure Electron APIs)
- **Ubiquitous Language**: window, lifecycle, shell, tray, quit, minimize

**2. Core Context**
- **Responsibility**: Configuration, state management, IPC coordination
- **Core Aggregates**:
  - AppConfiguration (immutable config)
  - StateManager (application state)
  - IPCRegistry (channel management)
- **Dependencies**: Shell (window references)
- **Ubiquitous Language**: config, state, ipc, channel, register, notify

**3. Teams Integration Context**
- **Responsibility**: Microsoft Teams web interface integration
- **Core Aggregates**:
  - ReactBridge (DOM access to Teams React internals)
  - TokenCache (authentication persistence)
  - TeamsNotification (notification interception)
- **Dependencies**: Core (IPC), Shell (preload injection)
- **Ubiquitous Language**: teams, react, token, inject, intercept, bridge

**4. Features Context**
- **Responsibility**: Optional user-facing enhancements
- **Core Aggregates**:
  - CustomBackground (background images)
  - ScreenSharing (desktop capture)
  - SpellChecker (text correction)
  - CustomCSS (style injection)
- **Dependencies**: Core (IPC, config), Teams Integration (DOM access)
- **Ubiquitous Language**: feature, enable, customize, enhance, inject

**5. Infrastructure Context**
- **Responsibility**: Cross-cutting technical concerns
- **Core Aggregates**:
  - NetworkMonitor (online/offline detection)
  - CacheManager (disk cache operations)
  - Logger (structured logging)
- **Dependencies**: Core (state updates)
- **Ubiquitous Language**: infrastructure, monitor, cache, log, persist

#### Context Relationships

```
┌─────────────────────────────────────────────────┐
│              Shell Context                      │
│  (Electron Lifecycle & Window Management)       │
└───────────────┬─────────────────────────────────┘
                │
                ↓
┌─────────────────────────────────────────────────┐
│              Core Context                       │
│  (Configuration, State, IPC Registry)           │
└───────┬───────────────────────────┬─────────────┘
        │                           │
        ↓                           ↓
┌──────────────────────┐   ┌────────────────────┐
│ Teams Integration    │   │   Features Context │
│      Context         │←──│  (Optional Modules)│
└──────────────────────┘   └────────────────────┘
        │                           │
        └────────────┬──────────────┘
                     ↓
          ┌──────────────────────┐
          │  Infrastructure      │
          │      Context         │
          └──────────────────────┘
```

### Clean Architecture Analysis

#### Proposed Layer Structure

**Presentation Layer (Renderer Process)**
- Preload scripts bridging isolated contexts
- UI event handlers
- IPC client implementations

**Application Layer (Main Process Coordination)**
- Application use cases (startup, shutdown, window management)
- IPC handlers orchestrating domain logic
- Event coordination between domains

**Domain Layer (Business Logic)**
- Bounded context implementations
- Domain models (Configuration, WindowState, UserStatus)
- Domain services (TokenBridge, NotificationService)

**Infrastructure Layer (Technical Concerns)**
- Electron API adapters
- File system operations
- Network communication
- System notifications

#### Dependency Flow
```
Presentation → Application → Domain ← Infrastructure
```

Benefits:
- Domain logic independent of Electron framework
- Testable business logic without Electron mocks
- Clear separation of technical and business concerns

Challenges:
- DOM injection requires Presentation → Domain communication
- IPC patterns span multiple layers
- Configuration must flow top-down

---

## Plugin Architecture Analysis

### Plugin System Evaluation

#### Internal Plugin Architecture (Recommended)

**Structure:**
```javascript
// plugins/core/notifications/manifest.json
{
  "id": "notifications",
  "name": "System Notifications",
  "version": "1.0.0",
  "requires": { "teams-for-linux": "^3.0.0" },
  "permissions": ["notifications", "ipc", "audio"],
  "main": "./index.js",
  "preload": "./preload.js"
}

// plugins/core/notifications/index.js
class NotificationsPlugin extends BasePlugin {
  constructor(api) {
    super(api);
    this.#soundManager = null;
  }

  async onActivate() {
    // Register IPC handlers
    this.api.ipc.handle('show-notification', this.#showNotification.bind(this));

    // Subscribe to events
    this.api.events.on('activity-detected', this.#handleActivity.bind(this));

    // Initialize sound system
    this.#soundManager = new SoundManager(this.api.config.get('notificationSound'));
  }

  async onDeactivate() {
    this.api.ipc.removeHandler('show-notification');
    this.api.events.off('activity-detected', this.#handleActivity);
    this.#soundManager?.cleanup();
  }

  #showNotification(event, { title, body, icon }) {
    // Implementation
  }

  #handleActivity(status) {
    // Update tray icon based on activity
  }
}

module.exports = NotificationsPlugin;
```

**Plugin Lifecycle:**
```javascript
// core/PluginManager.js
class PluginManager {
  constructor(api) {
    this.#plugins = new Map();
    this.#api = api;
  }

  async loadPlugin(manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    this.#validateManifest(manifest);

    const PluginClass = require(path.join(path.dirname(manifestPath), manifest.main));
    const plugin = new PluginClass(this.#createSandboxedAPI(manifest.permissions));

    await plugin.onActivate();
    this.#plugins.set(manifest.id, { manifest, instance: plugin });
  }

  async unloadPlugin(pluginId) {
    const plugin = this.#plugins.get(pluginId);
    if (plugin) {
      await plugin.instance.onDeactivate();
      this.#plugins.delete(pluginId);
    }
  }

  #createSandboxedAPI(permissions) {
    return {
      ipc: permissions.includes('ipc') ? this.#api.ipc : null,
      events: this.#api.events,
      config: this.#api.config.scoped(),
      // ...other sandboxed APIs
    };
  }
}
```

### Plugin API Surface

**Core Plugin API:**
```javascript
/**
 * Plugin API provided to plugins for interacting with the application.
 * Plugins receive a sandboxed version based on their declared permissions.
 */
class PluginAPI {
  constructor(permissions) {
    // IPC Communication (requires 'ipc' permission)
    this.ipc = permissions.includes('ipc') ? {
      handle: (channel, handler) => { /* Register IPC handler */ },
      removeHandler: (channel) => { /* Remove IPC handler */ },
      send: (channel, data) => { /* Send IPC message */ }
    } : null;

    // Event Bus (always available)
    this.events = {
      on: (event, handler) => { /* Subscribe to event */ },
      off: (event, handler) => { /* Unsubscribe from event */ },
      emit: (event, data) => { /* Emit event */ }
    };

    // Configuration (always available, scoped to plugin)
    this.config = {
      get: (key) => { /* Get config value */ },
      set: (key, value) => { /* Set config value */ },
      scoped: (prefix) => { /* Get scoped config */ }
    };

    // Window Management (requires 'windows' permission)
    this.windows = permissions.includes('windows') ? {
      getMain: () => { /* Get main window */ },
      create: (options) => { /* Create new window */ }
    } : null;

    // Teams Integration (requires 'teams-integration' permission)
    this.teams = permissions.includes('teams-integration') ? {
      injectScript: (script) => { /* Inject script into Teams web view */ },
      onReactReady: (callback) => { /* Called when React is ready */ },
      getTokenCache: async () => { /* Get token cache */ }
    } : null;
  }
}
```

### Migration Phases

**Phase 1: Internal Plugin System (Weeks 1-4)**
- Convert existing 32 modules to plugin structure
- Implement PluginManager and BasePlugin
- Define plugin API surface
- No external plugin support

**Phase 2: User Control (Weeks 5-7)**
- Add plugin enable/disable UI
- Implement plugin configuration interface
- Allow users to control which features are active
- Still no external plugins

**Phase 3: External Plugins (Future, Post-v3.0)**
- Define stable external plugin API
- Implement plugin marketplace/registry
- Add plugin signing and verification
- Community plugin support

---

## Architecture Comparison Matrix

| Aspect | Current | DDD Only | Clean Arch Only | Plugin System Only | **Recommended Hybrid** |
|--------|---------|----------|-----------------|-------------------|----------------------|
| **Code Organization** | ⚠️ Monolithic index.js | ✅ Clear domains | ✅ Layered | ⚠️ Flat plugins | ✅ DDD + Plugins |
| **DOM Access** | ✅ Direct | ✅ Preserved | ⚠️ Complex | ✅ Via API | ✅ Teams Integration context |
| **Extensibility** | ❌ Modify core | ⚠️ Add to contexts | ⚠️ Add to layers | ✅ Add plugins | ✅ Add plugins to contexts |
| **Testing** | ⚠️ Integration heavy | ✅ Unit testable | ✅ Isolated layers | ✅ Isolated plugins | ✅ Both unit + integration |
| **Migration Risk** | N/A | Medium | High | Medium | Low (phased) |
| **Learning Curve** | Low (current) | Medium | High | Low | Medium |
| **Performance** | ✅ Direct | ✅ No overhead | ✅ No overhead | ⚠️ Plugin loading | ✅ Minimal overhead |
| **Backward Compat** | N/A | ✅ Preserved | ⚠️ May break | ✅ Wrapped | ✅ Fully preserved |
| **Community Contribution** | ⚠️ Requires core access | ⚠️ Context knowledge | ⚠️ Architecture knowledge | ✅ Plugin API | ✅ Plugin in context |

**Legend**: ✅ Strong ⚠️ Adequate ❌ Weak

---

## Recommended Architecture

### Hybrid Approach: DDD + Internal Plugin System

**Rationale**: Combine organizational clarity of DDD with extensibility of plugin architecture while preserving all existing functionality.

**Structure:**
```
app/
├── core/
│   ├── Application.js (thin orchestrator)
│   ├── PluginManager.js (plugin lifecycle)
│   └── EventBus.js (cross-domain events)
├── domains/
│   ├── shell/
│   │   ├── ShellDomain.js (entry point)
│   │   ├── services/
│   │   │   ├── WindowManager.js
│   │   │   └── TrayManager.js
│   │   └── models/
│   │       └── WindowState.js
│   ├── configuration/
│   │   ├── ConfigurationDomain.js
│   │   ├── AppConfiguration.js
│   │   └── StateManager.js
│   ├── teams-integration/
│   │   ├── TeamsIntegrationDomain.js
│   │   ├── services/
│   │   │   ├── ReactBridge.js
│   │   │   ├── TokenCache.js
│   │   │   └── NotificationInterceptor.js
│   │   └── preload/
│   │       └── teams-preload.js
│   └── infrastructure/
│       ├── InfrastructureDomain.js
│       └── services/
│           ├── Logger.js
│           └── CacheManager.js
└── plugins/
    ├── BasePlugin.js
    ├── PluginAPI.js
    └── core/ (built-in features as plugins)
        ├── notifications/
        │   ├── manifest.json
        │   ├── index.js (main process)
        │   └── preload.js (renderer)
        ├── screen-sharing/
        ├── custom-background/
        ├── spell-checker/
        └── custom-css/
```

### Core Components

**Application.js** (replaces index.js):
```javascript
class Application {
  #domains = new Map();
  #pluginManager;
  #eventBus;

  constructor() {
    this.#eventBus = new EventBus();
  }

  async start() {
    // 1. Initialize domains in dependency order
    await this.#initializeDomain('infrastructure');
    await this.#initializeDomain('configuration');
    await this.#initializeDomain('shell');
    await this.#initializeDomain('teams-integration');

    // 2. Load plugins
    this.#pluginManager = new PluginManager(this.#createPluginAPI());
    await this.#pluginManager.loadCorePlugins();

    // 3. Start application
    this.#eventBus.emit('app:ready');
  }

  #createPluginAPI() {
    return new PluginAPI({
      config: this.#domains.get('configuration').getPublicAPI(),
      windows: this.#domains.get('shell').getPublicAPI(),
      teams: this.#domains.get('teams-integration').getPublicAPI(),
      events: this.#eventBus,
    });
  }
}
```

**BasePlugin.js**:
```javascript
class BasePlugin {
  constructor(api) {
    if (new.target === BasePlugin) {
      throw new Error('BasePlugin is abstract');
    }
    this._api = api;
  }

  // Lifecycle hooks (must be implemented by subclasses)
  async onActivate() {
    throw new Error('onActivate must be implemented');
  }

  async onDeactivate() {
    throw new Error('onDeactivate must be implemented');
  }

  // Optional hooks
  async onConfigChange(config) {}
  async onWindowReady(window) {}
}
```

### Domain Boundaries

**Teams Integration Domain** (Critical for DOM Access):
```javascript
// domains/teams-integration/TeamsIntegrationDomain.js
class TeamsIntegrationDomain {
  #reactBridge;
  #tokenCache;
  #allowedDomains = ['teams.microsoft.com', 'teams.live.com'];

  async initialize(shellAPI, configAPI) {
    this.#reactBridge = new ReactBridge(this.#allowedDomains);
    this.#tokenCache = new TokenCache(configAPI.getUserDataPath());
  }

  getPublicAPI() {
    return {
      // Limited API for plugins
      injectScript: (script) => this.#validateAndInject(script),
      onReactReady: (callback) => this.#reactBridge.onReady(callback),
      getTokenCache: () => this.#tokenCache.read(),
    };
  }

  #validateAndInject(script) {
    // Security validation before injection
    if (!this.#isSecureScript(script)) {
      throw new Error('Script failed security validation');
    }
    this.#reactBridge.inject(script);
  }
}
```

---

## Migration Roadmap

### Parallel Development Strategy

**Main Branch (2.6.x)**: Continue normal development
- Bug fixes and small features released as 2.6.8, 2.6.9, etc.
- No disruption to current users
- Maintain stable release cadence

**Feature Branch (3.0.0)**: Architecture modernization
- All refactoring work happens on `feature/architecture-modernization-1799`
- Periodically merge `main` → feature branch to stay current
- Independent testing and validation
- When complete, merge to main and release as 3.0.0

**Benefits**:
- No blocking of urgent fixes or features
- Reduced merge conflicts (periodic syncs)
- Lower risk (can abandon if needed)
- Community continues to get updates

### 10-Week Phased Migration

**Phase 1: Foundation (Weeks 1-2)**
- Create `core/` directory structure
- Implement `Application.js`, `EventBus.js`, `PluginManager.js`, `BasePlugin.js`
- Define domain interfaces
- Create plugin API specification
- **Deliverable**: Core architecture skeleton
- **Tests**: Core component unit tests
- **Risk**: Low - no existing code modified

**Phase 2: Infrastructure Domain (Week 3)**
- Extract `Logger`, `CacheManager`, `NetworkMonitor` to `domains/infrastructure/`
- Migrate cache module to domain structure
- Implement infrastructure domain API
- **Deliverable**: First working domain
- **Tests**: Infrastructure domain integration tests
- **Risk**: Low - isolated functionality

**Phase 3: Configuration Domain (Week 4)**
- Move `appConfiguration/` to `domains/configuration/`
- Implement `StateManager` for global state
- Replace global variables with state management
- **Deliverable**: Centralized configuration and state
- **Tests**: Configuration domain unit tests
- **Risk**: Medium - touches many modules

**Phase 4: Shell Domain (Week 5)**
- Extract window management to `domains/shell/`
- Migrate `mainAppWindow/` module
- Implement tray management service
- **Deliverable**: Shell domain with window lifecycle
- **Tests**: Window management integration tests
- **Risk**: Medium - critical startup path

**Phase 5: Teams Integration Domain (Week 6)**
- Extract `reactHandler`, `tokenCacheBridge` to `domains/teams-integration/`
- Implement secure injection API
- Consolidate preload scripts
- **Deliverable**: Teams integration domain with DOM access
- **Tests**: React bridge tests, token cache tests
- **Risk**: High - critical functionality, extensive testing required

**Phase 6: First Plugin Migration (Week 7)**
- Convert `notifications/` module to plugin
- Implement plugin manifest system
- Test plugin lifecycle (activate/deactivate)
- **Deliverable**: First working plugin
- **Tests**: Plugin lifecycle tests, notification tests
- **Risk**: Medium - validates plugin architecture

**Phase 7: Bulk Plugin Migration (Weeks 7-8)**
- Convert remaining 32 modules to plugins (after notifications in Phase 6)
- **Week 7**: Main process modules (16 modules)
  - screen-sharing, custom-background, spell-checker, custom-css
  - documentation-window, gpu-info-window, incoming-call-toast, menus
  - certificate, login, intune, connection-manager, cache-manager, helpers
- **Week 8**: Browser tools (16 modules)
  - activity-hub, disable-autogain, theme, tray-icon-renderer, tray-icon-chooser
  - zoom, settings, shortcuts, wake-lock, navigation-buttons
  - emulate-platform, mutation-title, timestamp-copy-override, react-handler, token-cache
- **Deliverable**: All modules as plugins
- **Tests**: Per-plugin unit tests, integration tests for critical plugins
- **Risk**: Medium - large volume but parallelizable; 2 weeks allows thorough testing

**Phase 8: Integration & Testing (Week 9)**
- End-to-end testing of full architecture
- Performance benchmarking
- Memory leak detection
- Cross-platform validation (Linux, Windows, macOS)
- **Deliverable**: Validated complete system
- **Tests**: E2E Playwright tests, performance tests
- **Risk**: Low - validation phase

**Phase 9: Documentation & Cleanup (Week 10)**
- Update architecture documentation
- Create plugin development guide
- Remove deprecated code
- Update contributing guidelines
- **Deliverable**: Complete documentation
- **Risk**: Low - documentation only

**Phase 10: Release Preparation**
- Create release notes
- Update CHANGELOG.md
- Tag v3.0.0
- Deploy documentation site updates
- Merge feature branch to main
- **Deliverable**: Release v3.0.0
- **Risk**: Low - release mechanics

### Testing Strategy

**Philosophy**: Focus on meaningful tests that validate behavior, not just coverage metrics. Tests should provide confidence in refactoring and catch real issues, not just satisfy arbitrary coverage thresholds.

#### Test Types by Priority

**1. Integration Tests (Highest Priority)**
- **Why**: Validate critical user-facing functionality works across domain boundaries
- **Focus Areas**:
  - DOM injection and Teams React bridge (Phase 5)
  - IPC communication between main/renderer processes
  - Plugin lifecycle (activate/deactivate/reload)
  - Authentication flow (token cache, login)
  - Notification interception and display
  - Screen sharing activation and teardown
- **Coverage Target**: All critical user paths (authentication, notifications, screen sharing)
- **Tools**: Playwright E2E tests (existing framework)
- **When**: After each domain/plugin migration, before phase completion

**2. Unit Tests (Medium Priority)**
- **Why**: Enable safe refactoring of domain logic and plugin internals
- **Focus Areas**:
  - Domain services (isolated business logic)
  - Plugin API surface validation
  - PluginManager lifecycle operations
  - EventBus pub/sub mechanics
  - Configuration management
  - IPC validation logic
- **Coverage Target**: 70%+ for domains and core infrastructure, >80% for critical paths
- **Tools**: Jest or Node's native test runner
- **When**: During implementation of each domain/plugin

**3. Contract Tests (Medium Priority)**
- **Why**: Ensure plugin API remains stable across changes
- **Focus Areas**:
  - Plugin API surface (each method signature)
  - Domain public APIs
  - IPC channel contracts
  - Event payloads and types
- **Coverage Target**: All public APIs
- **Tools**: Custom assertion helpers, schema validation
- **When**: Phase 1 (define contracts), validate throughout migration

**4. Visual Regression Tests (Low Priority)**
- **Why**: Catch unintended UI changes
- **Focus Areas**:
  - Tray icon rendering
  - Custom CSS injection effects
  - Theme switching
- **Coverage Target**: Critical UI components only
- **Tools**: Playwright screenshot comparison
- **When**: Phase 8 (integration testing phase)

#### Tests NOT to Write

**Avoid:**
- Tests that simply assert implementation details (e.g., "verify private method called")
- Tests with mocks that replicate entire Electron API (brittle, false confidence)
- Tests for trivial getters/setters without logic
- Tests that achieve coverage but don't validate behavior
- Over-specified tests that break on every refactor

**Instead:**
- Test observable behavior and outcomes
- Use real dependencies where practical (e.g., real EventBus, not mock)
- Focus on edge cases and error handling
- Test what the code does, not how it does it

#### Per-Phase Testing Requirements

**Phase 1 (Foundation)**: Unit tests for EventBus, PluginManager, BasePlugin
- Test: Event subscription/emission, plugin load/unload lifecycle
- No integration tests needed yet (no real plugins)

**Phase 2 (Infrastructure Domain)**: Unit + Integration
- Unit: Logger, CacheManager, NetworkMonitor in isolation
- Integration: Verify cache operations don't break existing functionality

**Phase 3 (Configuration Domain)**: Unit + Integration
- Unit: StateManager, config scoping, immutability
- Integration: Verify existing config usage patterns still work

**Phase 4 (Shell Domain)**: Unit + Integration
- Unit: WindowManager, TrayManager lifecycle
- Integration: E2E test of window creation, tray icon updates

**Phase 5 (Teams Integration Domain)**: Heavy Integration Testing
- Unit: ReactBridge, TokenCache (where possible)
- Integration: **Critical** - DOM injection, React access, token persistence, notification interception
- E2E: Full authentication flow, notification flow, activity status updates
- Manual: Test against real Teams web app (DOM structure changes)

**Phase 6 (First Plugin)**: Establish Plugin Testing Pattern
- Unit: Notification plugin business logic
- Integration: Plugin lifecycle, IPC handlers, event subscriptions
- Contract: Validate plugin API usage
- Template: This becomes the pattern for all subsequent plugins

**Phase 7-8 (Bulk Migration)**: Parallel Plugin Testing
- Unit: Per-plugin business logic (parallelizable)
- Integration: Critical plugins only (screen-sharing, tray, theme)
- Smoke: Quick validation for simple plugins (zoom, shortcuts)

**Phase 9 (Integration & Testing)**: Full System Validation
- E2E: All critical user paths (login, meeting join, notifications, screen sharing)
- Performance: Startup time, memory usage, CPU during calls
- Cross-platform: Linux, Windows, macOS
- Regression: All existing Playwright tests pass

#### Testing Guidelines

**Quality over Quantity:**
- A single well-written integration test > 10 shallow unit tests
- Coverage is a side effect of good tests, not the goal
- If you're struggling to test something, the design might be wrong

**Test Naming:**
- Describe behavior: `"plugin activates and registers IPC handlers"`
- Not implementation: `"onActivate calls registerHandlers"`

**Test Independence:**
- Each test creates its own fixtures
- No shared state between tests
- Tests can run in any order

**Fast Feedback:**
- Unit tests should run in less than 10ms each
- Integration tests less than 500ms each
- E2E tests less than 5s each (use existing Playwright patterns)

**When Tests Fail:**
- Fix the code or update the test (don't disable)
- If test is flaky, investigate and fix root cause
- Document known flaky tests with issue links

#### TypeScript Decision: Stay with JavaScript

**Rationale**: Migrating to TypeScript during architecture refactoring adds significant complexity and risk.

**Benefits of Staying JavaScript:**
- No additional build tooling complexity
- Faster development velocity during migration
- Existing team knowledge and patterns
- Can add TypeScript later if needed (incremental adoption)

**Mitigation for Type Safety:**
- Use JSDoc comments for function signatures (IDE support)
- Runtime validation at domain boundaries
- Comprehensive tests validate contracts
- Plugin API schema validation

**Future Consideration:**
- After v3.0.0 stabilizes, evaluate incremental TypeScript adoption
- Start with new plugins or domains if desired
- Not required for architecture modernization goals

### Success Metrics

**Code Quality:**
- `index.js` reduced from 711 lines to less than 100 lines
- Unit test coverage increased from current to over 70%
- Cyclomatic complexity reduced by 40%

**Maintainability:**
- New feature development in isolated plugin (less than 500 lines)
- Domain boundaries prevent cross-cutting changes
- Plugin API enables community contributions

**Performance:**
- Startup time unchanged (less than 5% variance)
- Memory usage unchanged (less than 10MB variance)
- No regression in E2E tests

**Risk Mitigation:**
- Each phase independently testable
- Rollback possible at any phase boundary
- Continuous integration validates each commit

---

## Risk Assessment & Mitigation Strategies

### High Risks

**Risk 1: DOM Injection Breaking**
- **Severity**: Critical
- **Probability**: Medium
- **Impact**: Core functionality (auth, notifications) fails
- **Mitigation**:
  - Extensive testing of `reactHandler` migration
  - Preserve exact DOM access patterns in Teams Integration domain
  - Implement comprehensive integration tests for React bridge
  - Keep original code accessible for rollback
- **Contingency**: Revert Teams Integration domain to original module

**Risk 2: IPC Channel Conflicts**
- **Severity**: High
- **Probability**: Medium
- **Impact**: Plugin communication failures, race conditions
- **Mitigation**:
  - Implement IPC registry with conflict detection
  - Namespace plugin IPC channels (e.g., `plugin:notifications:show`)
  - Validate IPC setup during plugin activation
  - Document IPC API clearly
- **Contingency**: Implement IPC channel arbitration system

### Medium Risks

**Risk 3: Plugin Lifecycle Bugs**
- **Severity**: Medium
- **Probability**: Medium
- **Impact**: Features fail to activate/deactivate cleanly
- **Mitigation**:
  - Implement robust error handling in PluginManager
  - Test activation/deactivation cycles extensively
  - Implement plugin health monitoring
  - Provide plugin debugging tools
- **Contingency**: Disable problematic plugins, log errors for debugging

**Risk 4: Performance Regression**
- **Severity**: Medium
- **Probability**: Low
- **Impact**: Slower startup, increased memory usage
- **Mitigation**:
  - Benchmark before migration (baseline)
  - Lazy-load plugins after window ready
  - Minimize plugin API overhead
  - Profile each phase
- **Contingency**: Optimize plugin loading, cache plugin instances

**Risk 5: Migration Scope Creep**
- **Severity**: Medium
- **Probability**: High
- **Impact**: Timeline extends beyond 10 weeks
- **Mitigation**:
  - Strict adherence to phased plan
  - Defer non-critical improvements to v3.1
  - Weekly progress reviews
  - Clear definition of "done" for each phase
- **Contingency**: Release with subset of plugins, complete remainder in v3.0.1

### Low Risks

**Risk 6: Developer Confusion**
- **Severity**: Low
- **Probability**: Medium
- **Impact**: Slower contribution velocity during transition
- **Mitigation**:
  - Comprehensive documentation updates
  - Architecture decision records (ADRs)
  - Plugin development guide
  - Example plugin implementations
- **Contingency**: Extended documentation phase, community Q&A sessions

**Risk 7: Backward Compatibility**
- **Severity**: Low
- **Probability**: Low
- **Impact**: User configurations break across version
- **Mitigation**:
  - Preserve all configuration keys
  - Implement configuration migration if needed
  - Test upgrade path from v2.4.x
  - Document breaking changes prominently
- **Contingency**: Provide configuration migration tool

### Risk Monitoring

**Weekly Risk Review:**
- Track risk probability changes
- Update mitigation strategies
- Document new risks as they emerge
- Adjust timeline if necessary

**Phase Gate Reviews:**
- Validate phase completion criteria
- Assess risk levels before proceeding
- Make go/no-go decisions at phase boundaries
- Document lessons learned

---

## Next Steps

### Immediate Actions (This Week)
1. **Review & Approval**: Share this research document with maintainers for feedback
2. **Spike Work**: Create proof-of-concept for PluginManager and BasePlugin
3. **Planning**: Break down Phase 1 into daily tasks
4. **Environment**: Set up feature branch `feature/architecture-modernization-1799`

### Week 1 Kickoff
1. Create `app/core/` directory structure
2. Implement `EventBus.js` with comprehensive tests
3. Implement `Application.js` skeleton
4. Define plugin API interface

### Success Criteria
- All 33 modules converted to plugins
- `index.js` reduced to less than 100 lines
- DOM access preserved and tested
- E2E tests pass
- Documentation complete
- Release v3.0.0

---

## References

### Internal Documentation
- [IPC API Documentation](../ipc-api.md)
- [DOM Access Investigation](./dom-access-investigation.md)
- [ADR-002: Token Cache Secure Storage](../adr/002-token-cache-secure-storage.md)
- [ADR-003: Token Refresh Implementation](../adr/003-token-refresh-implementation.md)
- [Automated Testing Strategy](./automated-testing-strategy.md)

### External Resources
**Domain-Driven Design:**
- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Bounded Context Pattern](https://martinfowler.com/bliki/BoundedContext.html)

**Clean Architecture:**
- [The Clean Architecture by Robert Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

**Plugin Architecture:**
- [VSCode Extension API](https://code.visualstudio.com/api)
- [Electron IPC Patterns](https://www.electronjs.org/docs/latest/api/ipc-main)

**Electron Best Practices:**
- [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

---

## Appendix: Agent Research Summary

This research was conducted using 5 parallel research agents investigating different aspects of architecture modernization:

**Agent 1 (VSCode Architecture)**: Unable to access external resources; recommended manual research of VSCode extension API patterns.

**Agent 2 (Discord/Slack)**: Analyzed current Teams for Linux patterns, confirmed project already follows many industry best practices including security-first design.

**Agent 3 (Electron Best Practices)**: Discovered extensive existing documentation in codebase, validated alignment with Electron security guidelines.

**Agent 4 (Domain-Driven Design)**: Identified 5 bounded contexts (Shell, Core, Teams Integration, Features, Infrastructure) with clear boundaries and proposed 10-week migration strategy.

**Agent 5 (Plugin Architecture)**: Detailed plugin system design with 3-phase migration (Internal → User Controls → External), comprehensive API specification, and lifecycle management patterns.

---

**Document Status**: Complete - Ready for maintainer review
**Next Review Date**: Prior to Phase 1 kickoff
**Document Owner**: Architecture Modernization Team

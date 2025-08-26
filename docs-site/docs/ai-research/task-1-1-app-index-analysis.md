# Task 1.1: app/index.js Analysis - Architecture Modernization

*Generated: 2025-01-26*  
*Status: Completed*  
*Related PRD: Architecture Modernization*

## Executive Summary

Analysis of `app/index.js` (577 lines) reveals a monolithic main process file handling multiple concerns that should be separated into domain-specific modules. The file combines Electron lifecycle management, IPC communication, system integration, and Teams-specific functionality in a single location.

## Current Responsibilities Catalog

### 1. Electron Application Lifecycle
- **Single instance management**: `app.requestSingleInstanceLock()` (line 60)
- **App event handling**: `ready`, `quit`, `render-process-gone`, `second-instance` (lines 78-87)
- **Protocol registration**: Sets as default handler for `msteams://` protocol (lines 67-70)
- **Process signal handling**: `SIGTRAP`, `SIGINT`, `SIGTERM` (lines 387-389)
- **Media access requests**: macOS camera/microphone permissions (lines 504-517)

### 2. Command Line Switch Management
- **Pre-config switches**: Core Electron behaviors (lines 188-203)
- **Post-config switches**: Environment-specific optimizations (lines 209-277)
- **Wayland support**: PipeWire integration for screen sharing (lines 212-223)
- **GPU management**: Hardware acceleration controls (lines 241-247)
- **Proxy configuration**: Server settings application (lines 225-228)

### 3. Configuration Management
- **AppConfiguration integration**: Centralized config loading (lines 22-31)
- **Config file watching**: Restart on configuration changes (line 88)
- **Startup config application**: Path resolution and app settings (lines 28-31)

### 4. IPC Handler Registration (23+ handlers identified)

#### Core Application IPC
- `get-config` (line 89): Configuration retrieval
- `config-file-changed` (line 88): App restart trigger
- `get-app-version` (line 113): Version information
- `get-system-idle-state` (line 92): System idle monitoring
- `user-status-changed` (line 111): Teams user status updates
- `set-badge-count` (line 112): Notification badge management

#### Screen Sharing & Media IPC
- `desktop-capturer-get-sources` (line 95): Available capture sources
- `choose-desktop-media` (line 98): Media source selection with UI
- `cancel-desktop-media` (line 104): Cancel source selection
- `get-screen-sharing-status` (line 128): Current sharing state
- `get-screen-share-stream` (line 132): Active stream information
- `get-screen-share-screen` (line 142): Screen dimensions
- `screen-sharing-stopped` (line 118): Share termination
- `resize-preview-window` (line 160): Thumbnail window resizing
- `stop-screen-sharing-from-thumbnail` (line 170): Thumbnail-triggered stop

#### Zoom & Partition Management
- `get-zoom-level` (line 93): Partition-specific zoom retrieval
- `save-zoom-level` (line 94): Zoom level persistence

#### Notification System
- `show-notification` (line 110): System notification display
- `play-notification-sound` (line 109): Audio notification playback

### 5. Global State Variables
- `userStatus` (line 44): Current Teams user status (-1 = unknown, 1 = available)
- `idleTimeUserStatus` (line 45): User status when system went idle
- `picker` (line 46): Screen picker window reference
- `player` (lines 48-56): Audio notification player instance
- `global.selectedScreenShareSource`: Screen sharing source tracking
- `global.previewWindow`: Preview window for screen sharing

### 6. Notification & Sound Management
- **Notification sounds**: Predefined sound files for Teams events (lines 33-42)
- **Sound playback**: Node-sound integration with fallback handling (lines 49-56)
- **System notifications**: Electron Notification API integration (lines 280-300)
- **Status-aware notifications**: User availability checks (lines 312-318)

### 7. Screen Sharing Infrastructure
- **Source selection UI**: Screen/window picker window creation (lines 548-576)
- **Preview window management**: Thumbnail display and controls (lines 118-175)
- **Media stream coordination**: Desktop capturer integration (lines 95-102)
- **Cross-process communication**: Screen sharing state synchronization

### 8. System Integration
- **Cache management**: CacheManager integration (lines 393-406)
- **Certificate handling**: Custom certificate error processing (lines 491-502)
- **Power monitoring**: System idle state detection (lines 411-451)
- **Global shortcuts**: Shortcut disable/enable on window focus (lines 529-546)

## IPC Communication Patterns

### Pattern Analysis
- **Handle-based (request-response)**: 15 handlers for data retrieval and async operations
- **Event-based (fire-and-forget)**: 8 handlers for state changes and notifications
- **One-time listeners**: 3 handlers for temporary operations (source selection, settings)

### Missing IPC Documentation
The current `docs-site/docs/ipc-api.md` is incomplete. Found additional handlers not documented:
- Screen sharing status and stream management (6 handlers)
- Zoom level management (2 handlers)
- Audio notification playback
- System idle state monitoring
- User status change handling
- Badge count management

## Domain Boundary Violations

### Mixed Concerns
1. **System-level operations** mixed with **Teams-specific functionality**
2. **Configuration management** scattered across lifecycle and feature code
3. **Screen sharing** logic split between main process and preview window management
4. **Notification system** combining sound playback, system notifications, and user status

### Tight Coupling Issues
1. **Global state** accessible across all functionality
2. **Direct module imports** without proper abstraction layers
3. **IPC handlers** directly manipulating global variables
4. **Configuration object** passed through multiple subsystems

## Recommendations for Domain Separation

### Proposed Domain Mapping
1. **Shell Domain**: Lines 18-32, 60-87, 188-277, 357-409 (Electron lifecycle, CLI switches, process management)
2. **Core Domain**: Lines 88-91, 111-115, 519-527 (Configuration, user status, app version)
3. **Integrations Domain**: Lines 92, 109-110, 280-331, 411-451, 529-546 (Notifications, system idle, shortcuts)
4. **UI Support Domain**: Lines 93-94, 95-175, 454-489, 548-576 (Zoom, screen sharing, media selection)

### State Encapsulation Needs
- **User status variables** → Core Domain state management
- **Screen sharing globals** → UI Support Domain encapsulation  
- **Audio player instance** → Integrations Domain service
- **Configuration object** → Cross-cutting concern with domain facades

### IPC Handler Redistribution
- **Shell Domain**: `config-file-changed`, `get-app-version`
- **Core Domain**: `get-config`, `user-status-changed`, `set-badge-count`
- **Integrations Domain**: `get-system-idle-state`, `show-notification`, `play-notification-sound`
- **UI Support Domain**: All screen sharing and media handlers, zoom handlers

## Risk Assessment

### High-Risk Refactoring Areas
1. **Screen sharing state management**: Complex global state with multiple windows
2. **Configuration dependencies**: Every domain requires config access
3. **IPC handler migration**: Must maintain exact API compatibility
4. **Notification system**: Interdependencies between sound, display, and status

### Migration Complexity
- **577 lines** need systematic decomposition
- **23+ IPC handlers** require careful domain assignment
- **8 global variables** need encapsulation strategies
- **Multiple module dependencies** need proper abstraction

## Next Steps

1. **Task 1.2**: Inventory all modules in `app/` directory and document current dependencies
2. **Task 1.3**: Map complete IPC channel list to proposed domain boundaries
3. **Task 1.4**: Identify all shared state requiring encapsulation
4. **Update IPC documentation**: Add missing 13+ handlers to `docs-site/docs/ipc-api.md`

---

*This analysis provides the foundation for domain-driven architecture migration while maintaining full backward compatibility.*
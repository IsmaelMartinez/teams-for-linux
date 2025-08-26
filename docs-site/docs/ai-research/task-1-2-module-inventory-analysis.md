# Task 1.2: Module Inventory & Dependency Analysis - Architecture Modernization

*Generated: 2025-01-26*  
*Status: Completed*  
*Related PRD: Architecture Modernization*

## Executive Summary

Comprehensive inventory of 19 modules in `app/` directory reveals a modular structure that partially follows domain-driven patterns but has significant inconsistencies, missing documentation, and architectural issues. Several modules show tight coupling to the monolithic `app/index.js` file and cross-dependencies that violate proper domain boundaries.

## Module Inventory & Classification

### Shell Domain Modules (Electron Lifecycle & System)

#### 1. `app/config/` - Configuration Logging
- **Purpose**: Logging configuration utilities
- **Files**: `index.js`, `logger.js`, `README.md`  
- **Dependencies**: Node.js `fs`, `path`
- **Status**: ✅ Well-documented, single responsibility
- **IPC**: None
- **Issues**: ⚠️ Separate from main configuration module

#### 2. `app/certificate/` - SSL Certificate Handling  
- **Purpose**: Custom certificate error handling for corporate environments
- **Files**: `index.js`
- **Dependencies**: None (pure logic)
- **Status**: ❌ No README, minimal documentation
- **IPC**: Called via `app.on('certificate-error')` callback
- **Issues**: ⚠️ Undocumented module, critical security functionality

### Core Domain Modules (Teams Integration & App Logic)

#### 3. `app/appConfiguration/` - Configuration Management
- **Purpose**: Centralized configuration loading, parsing, and access
- **Files**: `index.js`, `README.md`
- **Dependencies**: Node.js `fs`, `path`, `os`
- **Status**: ✅ Well-documented with cross-references to docs
- **IPC**: `get-config` (primary consumer)
- **Architecture**: ✅ Proper singleton pattern, immutable design

#### 4. `app/mainAppWindow/` - Primary Window Management
- **Purpose**: Teams BrowserWindow lifecycle and configuration  
- **Files**: `index.js`, `browserWindowManager.js`, `README.md`
- **Dependencies**: 11+ modules (high coupling)
  - `../screenSharing` (StreamSelector)
  - `../login`, `../customCSS`, `../menus`
  - `../spellCheckProvider`, `../connectionManager`
  - `../browser/tools/trayIconChooser`
  - `../incomingCallToast`
- **Status**: ✅ Good documentation, ⚠️ high coupling
- **IPC**: 4 handlers (select-source, call events)
- **Issues**: ❌ Central coordination point, violates single responsibility

#### 5. `app/intune/` - Enterprise SSO Integration
- **Purpose**: Microsoft Intune SSO authentication
- **Files**: `index.js`, `README.md`
- **Dependencies**: Unknown (not analyzed in detail)
- **Status**: ✅ Basic documentation  
- **IPC**: Unknown
- **Issues**: ⚠️ Enterprise-specific, may need domain separation

#### 6. `app/login/` - Authentication Dialog
- **Purpose**: NTLM authentication dialog  
- **Files**: `index.js`, `login.html`, `preload.js`, `README.md`
- **Dependencies**: Electron BrowserWindow
- **Status**: ✅ Well-documented, secure implementation
- **IPC**: `submitForm` handler
- **Architecture**: ✅ Good security practices, proper cleanup

### Integrations Domain Modules (System Integration)

#### 7. `app/connectionManager/` - Network Connection Management
- **Purpose**: Network status and connectivity handling
- **Files**: `index.js`, `README.md`  
- **Dependencies**: Unknown implementation details
- **Status**: ⚠️ Minimal documentation
- **IPC**: `offline-retry` handler
- **Issues**: ❌ Implementation details not documented

#### 8. `app/cacheManager/` - Application Cache Management
- **Purpose**: Automatic cache size monitoring and cleanup
- **Files**: `index.js`, `README.md`
- **Dependencies**: Node.js `fs`, partition-aware
- **Status**: ✅ Good documentation with problem context
- **IPC**: None (automatic service)
- **Architecture**: ✅ Background service pattern

#### 9. `app/menus/` - Application Menus & Tray
- **Purpose**: Application menu bar and system tray management
- **Files**: `index.js`, `appMenu.js`, `tray.js`, `README.md`
- **Dependencies**: High coupling - connects to multiple subsystems
  - `../spellCheckProvider`, `../connectionManager`  
- **Status**: ⚠️ Basic documentation
- **IPC**: `tray-update`, `get-teams-settings`, `set-teams-settings`
- **Issues**: ❌ Central coordination, multiple responsibilities

#### 10. `app/incomingCallToast/` - Call Notification Popups
- **Purpose**: Native call notification popups  
- **Files**: `index.js`, `incomingCallToast.html`, `incomingCallToastPreload.js`, `README.md`
- **Dependencies**: `electron-positioner`
- **Status**: ✅ Well-documented
- **IPC**: `incoming-call-action`, `incoming-call-toast-ready`
- **Architecture**: ✅ Clean encapsulation, proper IPC patterns

#### 11. `app/spellCheckProvider/` - Spell Checking
- **Purpose**: Multi-language spell checking integration
- **Files**: `index.js`, `codes.js`, `README.md`
- **Dependencies**: Electron spell checking APIs
- **Status**: ✅ Documented with configuration references
- **IPC**: Language change events (not directly documented)
- **Architecture**: ✅ Service pattern

### UI Support Domain Modules (Themes & Media)

#### 12. `app/screenSharing/` - Screen Sharing System
- **Purpose**: Complete screen sharing implementation including source selection
- **Files**: `index.js`, `browser.js`, `preload.js`, `index.html`, `index.css`, `injectedScreenSharing.js`, `previewWindow.html`, `previewWindowPreload.js`, `README.md`
- **Dependencies**: Electron desktopCapturer, complex UI components
- **Status**: ✅ Extensive documentation (197 lines README)
- **IPC**: `selected-source`, `close-view` handlers
- **Architecture**: ✅ Well-architected with proper separation
- **Issues**: ⚠️ Name inconsistency (README calls it "Stream Selector")

#### 13. `app/customBackground/` - Custom Background Images
- **Purpose**: Custom video call background management
- **Files**: `index.js`, `example/` directory with samples
- **Dependencies**: `../helpers` (HTTP utilities)
- **Status**: ❌ No README documentation
- **IPC**: `get-custom-bg-list` handler
- **Issues**: ❌ Undocumented module, complex HTTP redirect logic

#### 14. `app/customCSS/` - Theme & Style Management
- **Purpose**: Custom CSS injection and built-in themes
- **Files**: `index.js`, `README.md`
- **Dependencies**: Asset files in `../assets/css/`
- **Status**: ✅ Good documentation with theme references
- **IPC**: None (renderer-side injection)
- **Architecture**: ✅ Clean theme management

#### 15. `app/browser/` - Renderer Process Integration
- **Purpose**: Client-side scripts and Teams web interface integration
- **Structure**:
  - `preload.js` - Main preload script  
  - `notifications/` - Activity monitoring (`activityManager.js`, `injectedNotification.js`)
  - `tools/` - 10+ browser-side tools
- **Dependencies**: Complex web integration, DOM manipulation
- **Status**: ✅ Basic documentation, ⚠️ complex subsystem
- **IPC**: Multiple renderer-to-main communications
- **Issues**: ❌ Large subsystem needs detailed analysis

### Utility & Support Modules

#### 16. `app/helpers/` - Utility Functions
- **Purpose**: Reusable utility functions and common logic
- **Files**: `index.js`, `README.md`  
- **Dependencies**: HTTP/URL utilities (used by customBackground)
- **Status**: ⚠️ Generic description, implementation not detailed
- **IPC**: None
- **Issues**: ⚠️ Cross-cutting utilities need better documentation

#### 17. `app/screenPicker/` - Legacy Screen Selection (Deprecated)
- **Purpose**: Screen source selection UI
- **Files**: `index.html`, `preload.js`, `renderer.js`
- **Dependencies**: Desktop capturer integration
- **Status**: ❌ No README, appears to be legacy code
- **IPC**: `source-selected` (used in app/index.js)
- **Issues**: ❌ Potentially redundant with screenSharing module

## Documentation Inconsistencies Found

### 1. Module Naming Conflicts
- **screenSharing/ README** refers to itself as "Stream Selector Module"  
- **Code references** use "StreamSelector" class name
- **Architecture diagrams** show "Stream Selector" and "Screen Sharing Manager" as separate
- **Impact**: Confusing module identity and documentation mismatch

### 2. Missing Documentation  
- `app/certificate/` - Critical security module has no README
- `app/customBackground/` - Complex HTTP redirect logic undocumented  
- `app/screenPicker/` - Legacy(?) module with no documentation
- **Impact**: Poor maintainability, unclear module purposes

### 3. Reference Path Inconsistencies
Multiple modules reference `../../docs/configuration.md` but some paths are incorrect:
- Should be `../../docs-site/docs/configuration.md` for Docusaurus migration
- **Affected**: `appConfiguration/`, `spellCheckProvider/`, `intune/`, `customCSS/`, `cacheManager/`
- **Impact**: Broken documentation links

### 4. Architecture Diagram Issues
Current `docs-site/docs/index.md` architecture diagram shows:
- "Stream Selector" as separate from "Screen Sharing Manager" 
- References `app/streamSelector/` directory that doesn't exist
- Missing several actual modules: `certificate/`, `helpers/`, `login/`
- **Impact**: Inaccurate system representation

### 5. IPC Documentation Gaps
Found 13+ IPC handlers not documented in `docs-site/docs/ipc-api.md`:
- Screen sharing handlers (`get-screen-sharing-status`, etc.)
- Call management (`call-connected`, `call-disconnected`) 
- Zoom management (`get-zoom-level`, `save-zoom-level`)
- Background management (`get-custom-bg-list`)
- **Impact**: Incomplete developer reference

## Dependency Analysis

### High Coupling Issues

#### 1. `app/mainAppWindow/` (11+ dependencies)
**Violates single responsibility** - coordinates too many subsystems:
- Screen sharing, login, CSS, menus, spell checking
- Connection management, tray icons, call toasts
- **Recommendation**: Break into domain-specific coordinators

#### 2. `app/menus/` (Multiple system integrations)
**Mixed concerns** - UI + system integration:
- Spell checking, connection management  
- Settings import/export, quit handling
- **Recommendation**: Separate menu UI from business logic

#### 3. Cross-Domain Dependencies
- **UI Support** → **Core**: `customBackground/` uses `helpers/`
- **Core** → **Integrations**: `mainAppWindow/` manages connection status
- **Integrations** → **Core**: `menus/` accesses configuration directly

### Circular Dependency Risks
- `menus/` ↔ `connectionManager/` ↔ `mainAppWindow/`
- Global state shared across multiple modules
- **Impact**: Hard to test, refactor, or isolate modules

## Module Distribution by Domain

| Domain | Modules | IPC Handlers | Documentation Status |
|--------|---------|--------------|---------------------|
| **Shell** | 2 | 1 | ⚠️ Mixed (1 missing README) |
| **Core** | 5 | 6+ | ✅ Generally good |
| **Integrations** | 6 | 8+ | ⚠️ Mixed (2 minimal docs) |
| **UI Support** | 6 | 4+ | ⚠️ Mixed (2 missing READMEs) |

## Migration Complexity Assessment

### Low Risk (Clean Modules)
- `app/cacheManager/` - Independent background service
- `app/incomingCallToast/` - Well-encapsulated UI component  
- `app/login/` - Single-purpose authentication dialog
- `app/spellCheckProvider/` - Service pattern with clear interface

### Medium Risk (Moderate Coupling)
- `app/customCSS/` - Theme management, renderer integration
- `app/connectionManager/` - Network status, some interdependencies
- `app/screenSharing/` - Complex but well-documented system
- `app/appConfiguration/` - Cross-cutting but well-designed

### High Risk (High Coupling)
- `app/mainAppWindow/` - Central coordinator, 11+ dependencies
- `app/menus/` - System integration hub, multiple responsibilities  
- `app/browser/` - Complex renderer integration, multiple tools
- `app/customBackground/` - HTTP redirects, security implications

### Unknown Risk (Needs Analysis)
- `app/certificate/` - Security-critical, undocumented
- `app/intune/` - Enterprise integration, scope unclear
- `app/screenPicker/` - Potentially legacy/redundant
- `app/helpers/` - Cross-cutting utilities, usage patterns unclear

## Recommendations

### 1. Immediate Documentation Fixes
- Create READMEs for: `certificate/`, `customBackground/`, `screenPicker/`
- Fix documentation path references to use `docs-site/docs/` 
- Update architecture diagram to reflect actual module structure
- Complete IPC documentation with missing 13+ handlers

### 2. Domain Boundary Clarification  
- Resolve `screenSharing/` vs "Stream Selector" naming
- Determine `screenPicker/` legacy status and remove if redundant
- Separate `mainAppWindow/` coordination responsibilities by domain
- Create proper domain facades for configuration access

### 3. Dependency Reduction
- Extract business logic from `menus/` UI components
- Create domain-specific coordinators instead of central `mainAppWindow/`
- Implement proper abstraction layers for cross-domain communication
- Establish shared service interfaces for common utilities

### 4. Architecture Alignment
- Update documentation to match actual implementation
- Create domain-specific documentation sections  
- Establish clear module ownership and responsibility boundaries
- Document interdependency contracts and communication patterns

## Next Steps

1. **Task 1.3**: Map all identified IPC channels to proposed domain boundaries
2. **Task 1.4**: Analyze shared state and global variables across all modules
3. **Update documentation**: Fix broken links and missing module docs
4. **Domain validation**: Confirm module assignments align with business logic

---

*This inventory provides the foundation for understanding current architecture before domain-driven migration.*
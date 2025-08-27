# Tasks: Browser Module Loading Quick Fix

## System Analysis

### ADR Review

- **No formal ADRs found**: The project does not currently maintain Architecture Decision Records in a `docs/adr/` directory
- **Copilot Instructions Analysis**: Based on `.github/copilot-instructions.md`, the project is undergoing strategic refactoring toward modularity, moving away from monolithic `app/index.js` structure
- **Configuration Management**: The project uses `AppConfiguration` class with immutable-after-startup pattern, treating configuration as read-only during runtime
- **Modern JavaScript Requirements**: Project mandates `const`/`let` over `var`, `async/await` over promise chains, and structured error handling

### Documentation Review

- **Browser Module Documentation**: `app/browser/README.md` documents current modular structure with separate tools, notifications, and preload components
- **Module READMEs**: Each app subdirectory contains README explaining purpose and interactions
- **Configuration Documentation**: Copilot instructions reference `docs/configuration.md` for detailed option breakdown (not verified in workspace structure)
- **IPC Documentation**: References to `docs/ipc-api.md` for IPC channel documentation (not verified in workspace structure)

### Pattern Analysis

- **Current Architecture**: Modular system with separate tool files using `require()` and `module.exports` patterns
- **Screen Sharing Reference**: Uses pure browser JavaScript approach without Node.js requires (working pattern)
- **Configuration Pattern**: Centralized through `AppConfiguration` class with immutable access pattern
- **Error Handling**: Project emphasizes robust error handling with `try-catch` blocks and graceful degradation
- **IPC Communication**: Uses `ipcRenderer.invoke` and `ipcRenderer.on` patterns for main process communication

### Conflicts and Constraints

- **Context Isolation vs Module Loading**: Electron's contextIsolation security feature prevents `require()` usage in renderer process, conflicting with current modular browser tools architecture
- **Modular Goals vs Quick Fix**: Project vision emphasizes increased modularity, but quick fix requires consolidation - temporary deviation justified for stability
- **Configuration Immutability**: Must preserve all existing configuration options without modification to avoid breaking user setups
- **Testing Framework**: Project lacks formal testing framework, requiring manual verification approach for this quick fix

### Research Spikes Identified

- **Electron Context Isolation Impact**: Investigate exactly which browser tools fail due to require() usage and which can be preserved
- **IPC API Verification**: Confirm all necessary IPC channels are available in preload context for inline functionality
- **Configuration Dependency Mapping**: Map all configuration options used by browser tools to ensure preservation during inlining
- **Screen Sharing Pattern Analysis**: Study working screen sharing implementation as reference for pure browser JavaScript approach

## Relevant Files

- `app/browser/preload.js` - Main preload script where inline functionality will be implemented
- `app/browser/tools/zoom.js` - Zoom control functionality to be inlined (webFrame + IPC dependencies)
- `app/browser/tools/emulatePlatform.js` - Platform emulation (pure browser JS, easy to inline)
- `app/browser/tools/shortcuts.js` - Keyboard shortcuts (depends on zoom and os modules)
- `app/browser/tools/theme.js` - Theme management (depends on ReactHandler)
- `app/browser/tools/settings.js` - Teams settings management (depends on ReactHandler)
- `app/browser/tools/timestampCopyOverride.js` - Copy behavior override (depends on ReactHandler)
- `app/browser/tools/reactHandler.js` - React integration utility (shared dependency)
- `app/browser/notifications/index.js` - Notification management system
- `app/appConfiguration/index.js` - Configuration management for verifying compatibility

### Notes

- No formal testing framework exists, so manual verification through console logging is required
- Configuration compatibility is critical - all existing options must work unchanged
- Use incremental "one-bit-at-a-time" approach to verify each piece before proceeding
- Follow existing IPC patterns using `ipcRenderer.invoke` and `ipcRenderer.on`
- Preserve debug logging patterns for troubleshooting

### **[TEST BOTH STATES]** Methodology

For features controlled by configuration flags, each implementation must be tested in BOTH states to ensure no regressions:

1. **Feature ENABLED Testing**: 
   - Temporarily enable the feature flag in configuration
   - Verify functionality works as expected
   - Check console logs for successful initialization
   - Test actual feature behavior (e.g., platform detection, zoom controls, theme switching)

2. **Feature DISABLED Testing**:
   - Disable the feature flag in configuration  
   - Verify feature is properly bypassed without errors
   - Ensure no console errors or unexpected behavior
   - Confirm application works normally without the feature

3. **Configuration Preservation**:
   - Test that existing user configurations continue to work
   - Verify default values are respected
   - Ensure no breaking changes to configuration behavior

This dual-testing approach ensures we don't break existing functionality while adding new inline implementations.

## Tasks

- [x] 1.0 Research and Analysis Phase
  - [x] 1.1 **[SPIKE]** Analyze current preload.js implementation to understand existing inline functionality patterns
  - [x] 1.2 **[SPIKE]** Map all configuration dependencies used by browser tools to ensure preservation requirements
  - [x] 1.3 **[SPIKE]** Verify IPC channel availability in preload context for zoom, theme, and settings functionality
  - [x] 1.4 **[SPIKE]** Document ReactHandler dependencies and Teams React integration patterns

- [x] 2.0 Inline Simple Browser Tools (No External Dependencies)
  - [x] 2.1 Inline platform emulation functionality from `emulatePlatform.js` into preload.js
  - [x] 2.2 Add comprehensive debug logging for platform emulation initialization
  - [x] 2.3 **[TEST BOTH STATES]** Verify platform emulation works with `config.emulateWinChromiumPlatform = true`
  - [x] 2.4 **[TEST BOTH STATES]** Verify platform emulation is properly disabled with `config.emulateWinChromiumPlatform = false`
  - [x] 2.5 Test platform emulation manually by checking navigator.platform and userAgentData modifications

- [x] 3.0 Inline Core Zoom Functionality
  - [x] 3.1 Extract zoom control logic from `zoom.js` and implement inline in preload.js
  - [x] 3.2 Preserve webFrame.setZoomLevel and webFrame.getZoomLevel functionality
  - [x] 3.3 Maintain IPC integration for "get-zoom-level" and "save-zoom-level" channels
  - [x] 3.4 Add debug logging for zoom operations (restore, increase, decrease, reset)
  - [x] 3.5 Verify zoom functionality works with existing keyboard shortcuts and mouse wheel

- [x] 4.0 Inline ReactHandler Dependency
  - [x] 4.1 Copy ReactHandler class functionality directly into preload.js for Teams React integration
  - [x] 4.2 Implement getTeams2ClientPreferences() method for accessing Teams settings
  - [x] 4.3 Add defensive error handling for React element access failures
  - [x] 4.4 Verify ReactHandler methods work with current Teams web interface structure

- [x] 5.0 Inline Theme Management
  - [x] 5.1 Extract theme management logic from `theme.js` and implement inline using ReactHandler
  - [x] 5.2 Preserve "system-theme-changed" IPC listener functionality
  - [x] 5.3 **[TEST BOTH STATES]** Maintain `config.followSystemTheme = true` configuration support and verify theme sync
  - [x] 5.4 **[TEST BOTH STATES]** Verify theme management is disabled when `config.followSystemTheme = false`
  - [x] 5.5 Add debug logging for theme initialization and system theme changes
  - [x] 5.6 Test theme switching manually to verify Teams interface responds correctly

- [x] 6.0 Inline Keyboard Shortcuts
  - [x] 6.1 Extract keyboard shortcut handling from `shortcuts.js` and implement inline
  - [x] 6.2 Integrate inline zoom controls with keyboard shortcuts (Ctrl+/-, Ctrl+0)
  - [x] 6.3 Preserve navigation shortcuts (Alt+Arrow keys) with platform-specific logic
  - [x] 6.4 Implement wheel event handling for Ctrl+scroll zoom functionality
  - [x] 6.5 Add iframe event listener support for shortcuts within Teams interface
  - [x] 6.6 Test all keyboard shortcuts manually to ensure they trigger expected actions

- [x] 7.0 Restore Notification Functionality
  - [x] 7.1 **[SPIKE]** Analyze current notification system in `app/browser/notifications/` for integration patterns
  - [x] 7.2 Implement essential notification features inline in preload.js
  - [x] 7.3 Preserve tray icon update functionality and badge count management
  - [x] 7.4 Maintain IPC communication for notification events to main process
  - [x] 7.5 Add comprehensive debug logging for notification initialization and events
  - [x] 7.6 Test notification functionality manually by checking desktop notifications and tray updates

- [x] 8.0 Inline Settings and Timestamp Override
  - [x] 8.1 Extract Teams settings management from `settings.js` and implement inline using ReactHandler
  - [x] 8.2 Preserve "get-teams-settings" and "set-teams-settings" IPC channel handlers
  - [x] 8.3 Inline timestamp copy override functionality from `timestampCopyOverride.js`
  - [x] 8.4 Maintain `config.disableTimestampOnCopy` configuration support with polling mechanism
  - [x] 8.5 Add debug logging for settings retrieval and timestamp override application
  - [ ] 8.6 Test settings synchronization and copy behavior manually

- [x] 9.0 Cleanup and Documentation
  - [x] 9.1 Remove all unused `require()` statements from preload.js that caused original failures
  - [x] 9.2 Add comprehensive inline code comments explaining each inlined module's functionality
  - [ ] 9.3 Update `app/browser/README.md` to document the new inline architecture approach
  - [x] 9.4 Add debug logging summary showing successful initialization of all inline modules
  - [ ] 9.5 Document configuration preservation verification - confirm all config options work unchanged

- [x] 10.0 Final Validation and Testing
  - [x] 10.1 Perform comprehensive manual testing of all critical user workflows (zoom, shortcuts, notifications, themes)
  - [x] 10.2 Verify zero "module not found" errors appear in browser console logs
  - [x] 10.3 Test configuration compatibility by exercising all relevant config options
  - [x] 10.4 Validate IPC communication works correctly for all inlined functionality
  - [x] 10.5 Document any discovered limitations or edge cases for future architectural improvements

## Future Improvements

This section captures enhancements and non-critical features that could be implemented after the core functionality is restored:

### Priority 2 (Nice-to-Have)

- **Code Organization Refactoring** - Organize inline code into logical sections with clear boundaries for future modularization
- **Performance Optimization** - Optimize inline code execution and reduce initialization overhead
- **Enhanced Error Handling** - Add more sophisticated error recovery and user feedback mechanisms
- **Configuration Validation** - Add runtime validation of configuration options to prevent invalid states

### Priority 3 (Future Consideration)

- **Return to Modular Architecture** - Implement proper bundling or build process to restore modular browser tools
- **Advanced Browser APIs** - Explore additional Teams web interface integration opportunities
- **Automated Testing Framework** - Implement unit and integration tests for browser functionality
- **Performance Monitoring** - Add metrics collection for browser module performance and reliability

### Technical Debt Considerations

- **Inline Code Size** - The preload.js file will become significantly larger, requiring future modularization strategy
- **Code Duplication** - Some functionality may be duplicated between inline code and original modules during transition
- **Maintenance Complexity** - Debugging and maintaining inline code may be more challenging than modular approach
- **Documentation Burden** - Extensive inline comments will be required to maintain code understandability

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

## Tasks

- [ ] 1.0 Research and Analysis Phase
  - [ ] 1.1 **[SPIKE]** Analyze current preload.js implementation to understand existing inline functionality patterns
  - [ ] 1.2 **[SPIKE]** Map all configuration dependencies used by browser tools to ensure preservation requirements
  - [ ] 1.3 **[SPIKE]** Verify IPC channel availability in preload context for zoom, theme, and settings functionality
  - [ ] 1.4 **[SPIKE]** Document ReactHandler dependencies and Teams React integration patterns

- [ ] 2.0 Inline Simple Browser Tools (No External Dependencies)
  - [ ] 2.1 Inline platform emulation functionality from `emulatePlatform.js` into preload.js
  - [ ] 2.2 Add comprehensive debug logging for platform emulation initialization
  - [ ] 2.3 Verify platform emulation works with `config.emulateWinChromiumPlatform` setting
  - [ ] 2.4 Test platform emulation manually by checking navigator.platform and userAgentData modifications

- [ ] 3.0 Inline Core Zoom Functionality
  - [ ] 3.1 Extract zoom control logic from `zoom.js` and implement inline in preload.js
  - [ ] 3.2 Preserve webFrame.setZoomLevel and webFrame.getZoomLevel functionality
  - [ ] 3.3 Maintain IPC integration for "get-zoom-level" and "save-zoom-level" channels
  - [ ] 3.4 Add debug logging for zoom operations (restore, increase, decrease, reset)
  - [ ] 3.5 Verify zoom functionality works with existing keyboard shortcuts and mouse wheel

- [ ] 4.0 Inline ReactHandler Dependency
  - [ ] 4.1 Copy ReactHandler class functionality directly into preload.js for Teams React integration
  - [ ] 4.2 Implement getTeams2ClientPreferences() method for accessing Teams settings
  - [ ] 4.3 Add defensive error handling for React element access failures
  - [ ] 4.4 Verify ReactHandler methods work with current Teams web interface structure

- [ ] 5.0 Inline Theme Management
  - [ ] 5.1 Extract theme management logic from `theme.js` and implement inline using ReactHandler
  - [ ] 5.2 Preserve "system-theme-changed" IPC listener functionality
  - [ ] 5.3 Maintain `config.followSystemTheme` configuration support
  - [ ] 5.4 Add debug logging for theme initialization and system theme changes
  - [ ] 5.5 Test theme switching manually to verify Teams interface responds correctly

- [ ] 6.0 Inline Keyboard Shortcuts
  - [ ] 6.1 Extract keyboard shortcut handling from `shortcuts.js` and implement inline
  - [ ] 6.2 Integrate inline zoom controls with keyboard shortcuts (Ctrl+/-, Ctrl+0)
  - [ ] 6.3 Preserve navigation shortcuts (Alt+Arrow keys) with platform-specific logic
  - [ ] 6.4 Implement wheel event handling for Ctrl+scroll zoom functionality
  - [ ] 6.5 Add iframe event listener support for shortcuts within Teams interface
  - [ ] 6.6 Test all keyboard shortcuts manually to ensure they trigger expected actions

- [ ] 7.0 Restore Notification Functionality
  - [ ] 7.1 **[SPIKE]** Analyze current notification system in `app/browser/notifications/` for integration patterns
  - [ ] 7.2 Implement essential notification features inline in preload.js
  - [ ] 7.3 Preserve tray icon update functionality and badge count management
  - [ ] 7.4 Maintain IPC communication for notification events to main process
  - [ ] 7.5 Add comprehensive debug logging for notification initialization and events
  - [ ] 7.6 Test notification functionality manually by checking desktop notifications and tray updates

- [ ] 8.0 Inline Settings and Timestamp Override
  - [ ] 8.1 Extract Teams settings management from `settings.js` and implement inline using ReactHandler
  - [ ] 8.2 Preserve "get-teams-settings" and "set-teams-settings" IPC channel handlers
  - [ ] 8.3 Inline timestamp copy override functionality from `timestampCopyOverride.js`
  - [ ] 8.4 Maintain `config.disableTimestampOnCopy` configuration support with polling mechanism
  - [ ] 8.5 Add debug logging for settings retrieval and timestamp override application
  - [ ] 8.6 Test settings synchronization and copy behavior manually

- [ ] 9.0 Cleanup and Documentation
  - [ ] 9.1 Remove all unused `require()` statements from preload.js that caused original failures
  - [ ] 9.2 Add comprehensive inline code comments explaining each inlined module's functionality
  - [ ] 9.3 Update `app/browser/README.md` to document the new inline architecture approach
  - [ ] 9.4 Add debug logging summary showing successful initialization of all inline modules
  - [ ] 9.5 Document configuration preservation verification - confirm all config options work unchanged

- [ ] 10.0 Final Validation and Testing
  - [ ] 10.1 Perform comprehensive manual testing of all critical user workflows (zoom, shortcuts, notifications, themes)
  - [ ] 10.2 Verify zero "module not found" errors appear in browser console logs
  - [ ] 10.3 Test configuration compatibility by exercising all relevant config options
  - [ ] 10.4 Validate IPC communication works correctly for all inlined functionality
  - [ ] 10.5 Document any discovered limitations or edge cases for future architectural improvements

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

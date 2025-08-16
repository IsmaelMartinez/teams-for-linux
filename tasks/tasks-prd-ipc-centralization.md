# Task List: IPC Event Centralization

Generated from: `tasks/prd-ipc-centralization.md`

## System Analysis

### ADR Review

- **No formal ADRs found**: The `docs/adr/` directory does not exist yet, indicating this project hasn't established Architecture Decision Records
- **Recommendation**: Consider creating ADRs as part of this centralization effort to document architectural decisions
- **Current guidance comes from**: `.github/copilot-instructions.md` and `CLAUDE.md` which provide architectural patterns and conventions

### Documentation Review

- **Existing IPC Documentation**: `docs/ipc-api.md` contains comprehensive documentation of current IPC channels (48+ handlers across 9 modules)
- **Current IPC Distribution**: Handlers scattered across:
  - `app/index.js`: 15+ core handlers (config, notifications, screen sharing)
  - `app/mainAppWindow/browserWindowManager.js`: Call management handlers
  - `app/screenSharing/index.js`: Screen sharing lifecycle handlers
  - `app/incomingCallToast/index.js`: Call toast handlers
  - `app/menus/`: Settings and tray handlers
  - Additional modules with specialized handlers
- **Integration Impact**: Screen sharing, call management, notifications, and configuration systems all heavily use IPC

### Pattern Analysis

- **Current Architecture**: Monolithic `app/index.js` being actively refactored into modules
- **Established Patterns**:
  - `ipcMain.handle` for request-response (returns data)
  - `ipcMain.on` for fire-and-forget notifications
  - `ipcMain.once` for one-time event handlers
  - AppConfiguration class for immutable configuration management
  - Module-based organization under `app/` directory
- **Code Style Requirements**:
  - No `var` - use `const`/`let`
  - `async/await` instead of promise chains
  - Private fields using `#property` syntax
  - Electron-log for structured logging

### Conflicts and Constraints

- **No major conflicts identified** between PRD requirements and existing patterns
- **Backward compatibility required**: Existing renderer processes must continue working during migration
- **Performance constraint**: No regression in IPC handling performance
- **Resource constraints**: AsyncAPI toolchain adds new dependencies and build complexity
- **Testing gap**: Project currently lacks comprehensive test coverage - this initiative could establish testing patterns

### Research Spikes Identified

- ✅ **AsyncAPI Toolchain Evaluation**: Completed - AsyncAPI suitable for documentation only, existing JS patterns preferred
- **Performance Benchmarking**: Establish baseline IPC performance metrics before refactoring  
- **Validation Library Assessment**: Simple AJV integration for optional validation
- **External Integration Architecture**: Research MQTT/webhook integration patterns for Electron apps
- **Migration Strategy Validation**: Focus on simple organization vs. complex refactoring

## Relevant Files

### Research and Documentation
- `docs/research/asyncapi-electron-ipc-research.md` - Research findings on AsyncAPI toolchain compatibility with Electron IPC patterns
- `docs/adr/001-simplified-ipc-centralization.md` - Architecture Decision Record documenting the simplified approach
- `scripts/generate-asyncapi-docs.js` - Custom script for generating AsyncAPI HTML documentation
- `app/ipc/README.md` - Comprehensive technical documentation for the IPC organization system
- `docs/ipc-organization-guide.md` - Developer guide with practical usage patterns and examples
- `docs/ipc-migration-checklist.md` - Step-by-step migration checklist for developers

### Core IPC Infrastructure (Implemented)
- `app/ipc/index.js` - Main IPC module entry point with unified interface
- `app/ipc/manager.js` - Core IPC manager with handler registry and lifecycle management
- `app/ipc/registry.js` - Module-based handler registration system
- `app/ipc/compatibility.js` - Backward compatibility layer for migration support
- `app/ipc/benchmark.js` - Performance monitoring and baseline tracking utilities
- `app/ipc/tests/manager.test.js` - Comprehensive unit tests for IPC manager
- `scripts/test-ipc-system.js` - Integration test script with mocked Electron environment
- `app/ipc/core/configuration.js` - Configuration handlers migration from app/index.js (pending)
- `app/ipc/core/notifications.js` - Notification handlers migration from app/index.js (pending)
- `app/ipc/core/system.js` - System state handlers migration from app/index.js (pending)
- `app/ipc/features/screenSharing.js` - Screen sharing handlers migration from app/screenSharing/ (pending)
- `app/ipc/features/calls.js` - Call management handlers migration from app/mainAppWindow/ (pending)

### AsyncAPI Infrastructure (Documentation Only)
- `docs/asyncapi/teams-for-linux-ipc.yaml` - AsyncAPI specification for documentation (new)
- `docs/ipc-api/` - Auto-generated HTML documentation from AsyncAPI (new)

### Migration Support
- `app/ipc/registry.js` - Simple handler registration following existing patterns
- `app/ipc/router.js` - Basic event routing with existing ipcMain patterns

### Testing
- `app/ipc/manager.test.js` - Unit tests for IPC manager
- `app/ipc/middleware/validation.test.js` - Validation middleware tests
- `tests/integration/ipc-migration.test.js` - Integration tests for migration
- `tests/performance/ipc-benchmarks.test.js` - Performance regression tests

### Notes

- Follow established modular patterns from `app/appConfiguration/` and `app/mainAppWindow/`
- Maintain backward compatibility during gradual migration
- Use `electron-log` for all logging following existing patterns
- Keep existing JavaScript patterns - no TypeScript needed
- AsyncAPI for documentation generation only, not code generation
- Simple centralization approach - avoid over-engineering

## Tasks

- [x] 1.0 AsyncAPI Documentation Setup (Simplified)
  - [x] 1.1 Research Spike: Evaluate AsyncAPI toolchain compatibility with Electron IPC patterns
  - [x] 1.2 Install minimal AsyncAPI dependencies (@asyncapi/cli, @asyncapi/html-template)
  - [x] 1.3 Create initial `docs/asyncapi/teams-for-linux-ipc.yaml` specification with 5-10 core events
  - [x] 1.4 Configure npm scripts for AsyncAPI documentation generation in package.json
  - [x] 1.5 Generate initial HTML documentation and validate setup
  - [x] 1.6 Document decision to use simplified approach (update ADR or copilot instructions)
- [x] 2.0 Simple IPC Organization (No External Libraries)
  - [x] 2.1 Create `app/ipc/manager.js` with basic handler registry using existing patterns
  - [x] 2.2 Implement simple handler registration following ipcMain.handle/on patterns
  - [x] 2.3 Add basic handler lifecycle management (register, cleanup)
  - [x] 2.4 Maintain full backward compatibility with existing ipcMain handlers
  - [x] 2.5 Create unit tests for IPC manager basic functionality
  - [x] 2.6 Performance benchmark: Establish baseline metrics before migration
- [ ] 3.0 Optional Validation System (Minimal)
  - [ ] 3.1 Add optional AJV dependency for schema validation
  - [ ] 3.2 Create simple validation utility for critical IPC events only
  - [ ] 3.3 Integrate validation with AsyncAPI schemas where beneficial
  - [ ] 3.4 Add validation tests for critical handlers
- [ ] 4.0 Core Handler Migration (JavaScript Patterns)
  - [ ] 4.1 Extract and organize configuration handlers from app/index.js (get-config, config-file-changed)
  - [ ] 4.2 Extract and organize system state handlers (get-system-idle-state, user-status-changed)
  - [ ] 4.3 Extract and organize notification handlers (show-notification, play-notification-sound, set-badge-count)
  - [ ] 4.4 Extract and organize zoom level handlers (get-zoom-level, save-zoom-level)
  - [ ] 4.5 Update AsyncAPI specification with migrated handler schemas
  - [ ] 4.6 Create integration tests verifying handler compatibility
  - [ ] 4.7 Ensure existing renderer processes continue working unchanged
- [ ] 5.0 Feature Handler Migration (Screen Sharing, Calls)
  - [ ] 5.1 Extract and organize screen sharing handlers from app/screenSharing/index.js
  - [ ] 5.2 Extract and organize call management handlers from app/mainAppWindow/browserWindowManager.js
  - [ ] 5.3 Extract and organize call toast handlers from app/incomingCallToast/index.js
  - [ ] 5.4 Organize remaining scattered handlers (tray-update, custom-bg-list, etc.)
  - [ ] 5.5 Update AsyncAPI specification with all organized handler schemas
  - [ ] 5.6 Create integration tests for feature handlers
  - [ ] 5.7 Performance testing: Verify no regression in screen sharing and call performance
  - [ ] 5.8 Update documentation and complete organization cleanup

## Future Improvements

### Priority 2 (Nice-to-Have)

- Real-time IPC monitoring dashboard - Web-based interface to monitor IPC events in development
- Plugin architecture for external handlers - Allow third-party extensions to register IPC handlers
- Advanced error recovery mechanisms - Automatic retry, circuit breakers for external integrations
- Performance optimization toolkit - Tools for identifying IPC bottlenecks and optimization opportunities
- Enhanced debugging tools - IPC event replay, step-through debugging for complex flows

### Priority 3 (Future Consideration)

- MQTT broker integration - Full bidirectional communication with external MQTT brokers
- Webhook delivery system - Reliable webhook delivery with retry mechanisms
- Event sourcing implementation - Complete audit trail of all IPC events for compliance
- Multi-tenant support - Support for multiple Teams accounts with isolated IPC contexts
- GraphQL subscription layer - Modern API layer on top of IPC for external integrations

### Technical Debt Considerations

- Test coverage establishment - Use this initiative to introduce comprehensive testing patterns
- Documentation automation - Auto-generate and maintain API documentation from code
- Type safety improvements - Leverage TypeScript for better compile-time error detection
- Performance monitoring - Establish metrics and alerting for IPC performance regressions
- Code organization modernization - Complete the modularization effort started in app/index.js
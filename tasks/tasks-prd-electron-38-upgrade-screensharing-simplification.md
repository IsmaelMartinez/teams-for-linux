# Task List: Electron 38 Upgrade with Screensharing Simplification

This task list provides a step-by-step implementation guide for upgrading Teams for Linux from Electron 37.6.0 to Electron 38.2.1 while simplifying the screensharing architecture.

<!-- toc -->

## System Analysis

### ADR Review

**ADRs Found:**
- `docs-site/docs/adr/token-cache-secure-storage.md` - Token cache security implementation
- `docs-site/docs/adr/token-refresh-implementation.md` - Token refresh mechanism

**Relevance to this feature:** Neither ADR directly impacts the Electron upgrade or screensharing implementation. These are focused on authentication/token management which should remain unaffected by this change.

**Conflicts:** None identified. No existing ADRs conflict with the Electron upgrade or screensharing modernization.

### Documentation Review

**Affected Documentation:**
- `docs-site/docs/screen-sharing.md` - User-facing screen sharing documentation
- `docs-site/docs/ipc-api.md` - IPC channel reference documentation
- `app/screenSharing/README.md` - Technical architecture documentation for stream selector module

**Integration Points:**
- Main App Window (`app/mainAppWindow/`) - Manages BrowserWindow and registers `setDisplayMediaRequestHandler`
- Screen Sharing Module (`app/screenSharing/`) - Contains StreamSelector class and 9 implementation files
- IPC System (`app/security/ipcValidator.js`) - Validates allowed IPC channels including screensharing channels
- Browser Preload Scripts (`app/browser/preload.js`, `app/screenSharing/preload.js`) - Enable secure IPC communication

**Dependencies:**
- Preview window creation logic in `app/mainAppWindow/index.js` (lines 45-148)
- Stream selector integration in `app/mainAppWindow/index.js` (lines 196-200+)
- IPC channels: `get-desktop-capturer-sources`, `screen-sharing-started`, `screen-sharing-stopped`, `selected-source`, `close-view`

### Pattern Analysis

**Current Architectural Patterns:**

1. **Module Organization Pattern:**
   - Single responsibility modules in `app/` directory
   - Each module has its own subdirectory with README.md
   - Example: `app/screenSharing/`, `app/mainAppWindow/`, `app/security/`

2. **IPC Communication Pattern:**
   - `ipcMain.handle` for request-response (e.g., `get-desktop-capturer-sources`)
   - `ipcMain.on` for fire-and-forget events (e.g., `screen-sharing-started`)
   - All IPC channels validated through `app/security/ipcValidator.js` allowlist
   - Preload scripts expose APIs via `window.electronAPI` (note: contextIsolation disabled)

3. **BrowserWindow Management Pattern:**
   - Window creation in dedicated manager classes (e.g., `BrowserWindowManager`)
   - Window state managed via `electron-window-state` library
   - Security configuration centralized in window creation

4. **WeakMap for Private Fields:**
   - Current StreamSelector class uses WeakMap pattern for private fields:
     ```javascript
     let _StreamSelector_parent = new WeakMap();
     let _StreamSelector_window = new WeakMap();
     ```
   - Modern Electron supports JavaScript `#privateField` syntax (preferred for new code)

5. **Error Handling Pattern:**
   - Try-catch blocks with `electron-log` for structured logging
   - Graceful degradation with user feedback
   - Defensive programming for DOM changes (Teams interface)

**Similar Features in Codebase:**
- Preview Window creation (`createScreenSharePreviewWindow` in `app/mainAppWindow/index.js`) uses BrowserWindow with similar pattern to what we need for modal dialogs
- Incoming Call Toast (`app/incomingCallToast/`) demonstrates creating child windows with parent relationships

**Deviations to Note:**
- StreamSelector currently uses **WebContentsView** (line 58 in `app/screenSharing/index.js`) which is less common
- Uses `setBrowserView()` (line 86) which is deprecated but still functional
- The PRD calls for replacing WebContentsView with modal BrowserWindow, which aligns with the BrowserWindow pattern used elsewhere

### Conflicts and Constraints

**Identified Conflicts:**
1. **WebContentsView vs BrowserWindow Pattern:**
   - Current: StreamSelector uses `WebContentsView` added as child view to parent window
   - Desired: Modal `BrowserWindow` dialog pattern (consistent with rest of codebase)
   - Resolution: Replace WebContentsView with modal BrowserWindow during simplification

2. **Multiple IPC Event Registrations:**
   - Current: Uses `ipcMain.once()` for `selected-source` and `close-view` in StreamSelector.show()
   - Constraint: Each call to `show()` registers new listeners that auto-cleanup with `once()`
   - Risk: Potential for orphaned listeners if window closed abnormally
   - Resolution: Ensure proper cleanup in all code paths, consider using `ipcMain.handle` instead

3. **Security Configuration Constraint:**
   - **MUST maintain:** `contextIsolation: false`, `nodeIntegration: false`, `sandbox: false`
   - Reason: Required for Teams DOM access (documented in CLAUDE.md and code comments)
   - Impact: Cannot modernize to contextBridge pattern for screensharing preload scripts
   - Mitigation: Existing CSP and IPC validation remain as compensating controls

**System Constraints:**
- Electron 38.x removes macOS 11 support → documentation must be updated
- Electron 38.x removes `ELECTRON_OZONE_PLATFORM_HINT` → use `XDG_SESSION_TYPE` instead
- No automated tests → manual testing only (per PRD non-goal)
- Must maintain cross-platform compatibility (Linux priority, but macOS/Windows supported)

**Trade-offs:**
1. **Code consolidation vs file count:**
   - Focus: Simplify architecture and reduce complexity (primary goal)
   - File count reduction: Secondary benefit, not strict requirement
   - Approach: Consolidate duplicate logic, not necessarily merge all files

2. **IPC simplification vs functionality:**
   - Must preserve all functionality (thumbnails, preview, selection)
   - Can simplify IPC patterns (e.g., combine related channels) without removing features
   - Cannot break existing security validation

### Research Spikes Identified

> [!NOTE]
> No significant research spikes required for this implementation. All technologies and APIs are well-documented and currently in use.

**Minor Investigation Areas:**
1. **WebContentsView removal impact** - Quick code review to ensure no hidden dependencies (estimated: 30 minutes)
2. **Modal BrowserWindow behavior** - Verify modal dialogs work consistently across Linux/macOS/Windows (estimated: 1 hour during implementation)
3. **Electron 38.x changelog review** - Scan for any additional breaking changes not captured in migration analysis (estimated: 30 minutes)

**No Third-Party Evaluations Needed:**
- All dependencies (Electron, electron-builder, etc.) are existing and vetted
- No new libraries or services to evaluate
- Using existing Electron APIs only

## Relevant Files

### Core Files to Modify

- `package.json` - Update Electron version from ^37.6.0 to ^38.2.1
- `app/screenSharing/index.js` - Replace WebContentsView with modal BrowserWindow, update StreamSelector class
- `app/screenSharing/README.md` - Update architecture diagrams and documentation to reflect modal BrowserWindow approach
- `app/mainAppWindow/index.js` - Update StreamSelector integration if needed (lines 196-200+)
- `app/mainAppWindow/browserWindowManager.js` - Verify compatibility with Electron 38.x window creation
- `docs-site/docs/screen-sharing.md` - Update user documentation if UX changes
- `docs-site/docs/ipc-api.md` - Update if IPC channels are modified or consolidated

### Files to Review/Verify

- `app/screenSharing/preload.js` - Verify IPC communication still works with modal BrowserWindow
- `app/screenSharing/browser.js` - May need updates for modal dialog event handling
- `app/screenSharing/index.html` - May need CSS/layout adjustments for modal presentation
- `app/screenSharing/index.css` - Styling updates if modal dialog requires different layout
- `app/security/ipcValidator.js` - Verify IPC channels remain in allowlist, update if channels consolidated
- `app/browser/preload.js` - Main window preload, verify no breaking changes from Electron 38.x
- `app/screenSharing/injectedScreenSharing.js` - Verify Teams DOM integration still works
- `app/index.js` - Main entry point, verify Electron 38.x compatibility

### Configuration Files

- `.github/workflows/*` - Verify CI/CD builds with Electron 38.x (if applicable)
- `scripts/afterpack.js` - Verify electron-builder compatibility
- `build/entitlements.mac.plist` - Verify macOS entitlements for screen recording still valid

### Documentation Files

- `ELECTRON_38_MIGRATION_ANALYSIS.md` - Reference document (no changes needed)
- `tasks/prd-electron-38-upgrade-screensharing-simplification.md` - Source PRD (no changes needed)
- `CLAUDE.md` - Project instructions (no changes expected)

### Notes

- No automated tests exist in this project (per CLAUDE.md: "The project currently lacks comprehensive test coverage")
- Manual testing protocol is defined in PRD Section: Testing Strategy
- Use `npm run lint` before committing changes (mandatory per CLAUDE.md)
- Use `npm start` to run the application during development
- Build commands: `npm run pack` (dev build), `npm run dist:linux` (Linux packages)

## Tasks

> [!IMPORTANT]
> This task list follows a phased approach: Electron upgrade first, then screensharing simplification. Both will be completed in a single PR as specified in the PRD.

### Phase 1: Core Electron Upgrade

- [x] 1.0 Upgrade Electron to 38.2.1 and Verify Core Functionality
  - [x] 1.1 Review Electron 38.x release notes and changelog for any additional breaking changes not covered in ELECTRON_38_MIGRATION_ANALYSIS.md
  - [x] 1.2 Update `package.json` to change `"electron": "^37.6.0"` to `"electron": "^38.2.1"`
  - [x] 1.3 Run `npm install` to install Electron 38.2.1 and resolve any dependency conflicts
  - [x] 1.4 Run `npm run lint` to ensure code style compliance before testing
  - [x] 1.5 Launch application with `npm start` and verify it starts without crashes
  - [x] 1.6 Test Teams login flow (both standard and SSO) to ensure authentication works
  - [x] 1.7 Test core Teams features: join meeting, send chat message, view notifications
  - [x] 1.8 Verify existing screensharing functionality still works (baseline test before refactoring)
  - [x] 1.9 Check Electron console for any deprecation warnings or errors related to APIs we use
  - [x] 1.10 Test basic window management (minimize, maximize, restore, close, tray integration)
  - [x] 1.11 Commit Electron upgrade with message: "chore: upgrade Electron from 37.6.0 to 38.2.1"

### Phase 2: Architecture Analysis and Planning

- [x] 2.0 Analyze and Plan Screensharing Architecture Modernization
  - [x] 2.1 Read all 9 files in `app/screenSharing/` directory to understand current implementation
  - [x] 2.2 Map out current IPC flow: identify all `ipcMain.on`, `ipcMain.once`, `ipcMain.handle` calls related to screensharing
  - [x] 2.3 Identify all usages of `WebContentsView` and `setBrowserView()` in screensharing code
  - [x] 2.4 Document dependencies between StreamSelector, preview window, and main window
  - [x] 2.5 Review `app/incomingCallToast/` as reference for modal window pattern
  - [x] 2.6 Review preview window creation in `app/mainAppWindow/index.js` (lines 45-148) as reference for BrowserWindow pattern
  - [x] 2.7 Verify IPC channels in `app/security/ipcValidator.js` allowlist: `selected-source`, `close-view`, `get-desktop-capturer-sources`, `screen-sharing-started`, `screen-sharing-stopped`
  - [x] 2.8 Create detailed refactoring plan: list specific code changes needed for WebContentsView → BrowserWindow conversion
  - [x] 2.9 Identify any potential race conditions or edge cases in current IPC listener cleanup
  - [x] 2.10 Document expected behavior changes (if any) for user experience

### Phase 3: WebContentsView Replacement

- [x] 3.0 Replace WebContentsView with Modal BrowserWindow Pattern
  - [x] 3.1 Back up current `app/screenSharing/index.js` for reference (copy to `index.js.bak` temporarily)
  - [x] 3.2 Completely refactored `StreamSelector` class: replaced WeakMaps with native private fields (#parent, #window, #callback, #isClosing)
  - [x] 3.3 Rewrote `StreamSelector.show()` method: replaced `new WebContentsView()` with `new BrowserWindow()` using modal pattern
  - [x] 3.4 Configured modal BrowserWindow properties: `parent`, `modal: true`, `show: false`, `frame: true`, `skipTaskbar: true`, standard dimensions
  - [x] 3.5 Set webPreferences for stream selector window: `preload` path, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`
  - [x] 3.6 Replaced `parent.contentView.addChildView(view)` with standard modal BrowserWindow pattern (no manual view management needed)
  - [x] 3.7 Removed `resizeView()` function and related resize event listeners (modal windows don't need manual resize like WebContentsView)
  - [x] 3.8 Created unified `#close()` private method: handles all cleanup (IPC listeners, callback execution, window destruction)
  - [x] 3.9 Implemented `#isClosing` flag guard: ensures callback only executes once regardless of execution path (IPC or closed event)
  - [x] 3.10 Updated `StreamSelector.show()` to use `window.once('ready-to-show', () => window.show())` pattern for smooth display
  - [x] 3.11 Test stream selector opening and closing without selecting a source (cancel scenario)
  - [x] 3.12 Test stream selector with screen selection and verify callback receives correct source
  - [x] 3.13 Test stream selector with window selection and verify callback receives correct source
  - [x] 3.14 Verify modal behavior: parent window should be disabled while stream selector is open
  - [x] 3.15 Run `npm run lint` to ensure code style compliance after refactoring
  - [x] 3.16 Code reduction: 142 lines → 83 lines (41% reduction), simplified architecture with native private fields

### Phase 4: IPC Simplification

- [ ] 4.0 Simplify IPC Communication Patterns
  - [ ] 4.1 Review current IPC usage: `ipcMain.once('selected-source')` and `ipcMain.once('close-view')` in StreamSelector
  - [ ] 4.2 Evaluate whether `selected-source` and `close-view` can be consolidated into single channel or converted to `ipcMain.handle` pattern
  - [ ] 4.3 If consolidating channels: update `app/screenSharing/preload.js` to expose new unified IPC API
  - [ ] 4.4 If consolidating channels: update `app/screenSharing/browser.js` to use new IPC channel names
  - [ ] 4.5 If consolidating channels: update `app/security/ipcValidator.js` allowlist to add new channels and/or remove old ones
  - [ ] 4.6 Test IPC communication after changes: verify source selection event reaches main process correctly
  - [ ] 4.7 Test IPC cleanup: verify no orphaned listeners remain after multiple open/close cycles of stream selector
  - [ ] 4.8 Review `screen-sharing-started` and `screen-sharing-stopped` IPC channels: determine if these can be simplified or consolidated
  - [ ] 4.9 Update `docs-site/docs/ipc-api.md` if any IPC channel names or signatures changed
  - [ ] 4.10 Run `npm run lint` to ensure code style compliance

> [!NOTE]
> If IPC channels are working well after WebContentsView replacement, minimal changes may be needed in Phase 4. Focus on cleanup and consolidation opportunities without breaking functionality.

### Phase 5: Cross-Platform Testing

- [ ] 5.0 Cross-Platform Testing and Validation
  - [ ] 5.1 **Linux X11 Testing** - Launch app on Linux X11 and verify basic functionality
  - [ ] 5.2 **Linux X11 Testing** - Open stream selector and verify all screens/windows appear with thumbnails
  - [ ] 5.3 **Linux X11 Testing** - Share screen in Teams meeting and verify preview window appears
  - [ ] 5.4 **Linux X11 Testing** - Stop screensharing via Teams interface and verify cleanup
  - [ ] 5.5 **Linux X11 Testing** - Test multi-monitor scenario if available
  - [ ] 5.6 **Linux Wayland Testing** - Launch app on Linux Wayland and verify basic functionality
  - [ ] 5.7 **Linux Wayland Testing** - Verify PipeWire integration works for screen capture
  - [ ] 5.8 **Linux Wayland Testing** - Share screen in Teams meeting and verify no regression from audio echo fix (#1800)
  - [ ] 5.9 **Linux Wayland Testing** - Test screen recording permissions flow
  - [ ] 5.10 **macOS Testing** - Launch app on macOS 12+ and verify basic functionality
  - [ ] 5.11 **macOS Testing** - Verify screen recording permissions prompt appears on first screensharing attempt
  - [ ] 5.12 **macOS Testing** - Share screen in Teams meeting and verify native window thumbnails render correctly
  - [ ] 5.13 **macOS Testing** - Test on both Intel and Apple Silicon if possible
  - [ ] 5.14 **Regression Testing** - Verify custom background functionality still works
  - [ ] 5.15 **Regression Testing** - Verify notification sounds work correctly
  - [ ] 5.16 **Regression Testing** - Verify tray icon badge count displays correctly
  - [ ] 5.17 **Regression Testing** - Verify SSO login still works (if configured)
  - [ ] 5.18 **Regression Testing** - Verify wake lock functionality works (if enabled in config)
  - [ ] 5.19 **Build Testing** - Run `npm run pack` and verify development build succeeds
  - [ ] 5.20 **Build Testing** - Run `npm run dist:linux` and verify Linux packages build successfully (AppImage, deb, rpm)
  - [ ] 5.21 **Build Testing** - Verify electron-builder compatibility with Electron 38.x (check for any build warnings)

> [!WARNING]
> Testing is the most critical phase. Do not skip any platform-specific tests. If a test fails, investigate and fix before proceeding.

### Phase 6: Documentation and Finalization

- [ ] 6.0 Documentation Updates and Final Review
  - [ ] 6.1 Update `app/screenSharing/README.md` - Replace WebContentsView architecture diagrams with modal BrowserWindow flow
  - [ ] 6.2 Update `app/screenSharing/README.md` - Update code examples to reflect new BrowserWindow pattern
  - [ ] 6.3 Update `app/screenSharing/README.md` - Update security section to note modal window approach
  - [ ] 6.4 Update `docs-site/docs/screen-sharing.md` - Document any user-facing UX changes (if applicable)
  - [ ] 6.5 Update `docs-site/docs/screen-sharing.md` - Update platform-specific notes if behavior changed
  - [ ] 6.6 Update `docs-site/docs/ipc-api.md` - Document any IPC channel changes from Phase 4
  - [ ] 6.7 Update `docs-site/docs/troubleshooting.md` - Add Electron 38.x-specific troubleshooting if needed
  - [ ] 6.8 Update README.md or installation docs - Change macOS minimum requirement from macOS 11 to macOS 12
  - [ ] 6.9 Update documentation - Replace references to `ELECTRON_OZONE_PLATFORM_HINT` with `XDG_SESSION_TYPE=wayland`
  - [ ] 6.10 Review all code comments in modified files - ensure they accurately reflect new implementation
  - [ ] 6.11 Remove temporary backup files (e.g., `index.js.bak`) if created during development
  - [ ] 6.12 Run final `npm run lint` across entire codebase
  - [ ] 6.13 Review git diff of all changes to ensure no unintended modifications
  - [ ] 6.14 Create comprehensive commit message documenting Electron upgrade and screensharing simplification
  - [ ] 6.15 Prepare PR description with testing notes for all platforms (Linux X11/Wayland, macOS, Windows)

---

## Future Improvements

This section captures enhancements and non-critical features that could be implemented after the core functionality is complete:

### Priority 2 (Nice-to-Have)

- **Modernize to `#private` fields** - Replace WeakMap pattern in StreamSelector with JavaScript private class fields (`#parent`, `#window`, etc.)
- **Add TypeScript definitions** - Create `.d.ts` files for better IDE support and type safety
- **Automated screensharing tests** - Implement automated tests using Spectron or similar for regression prevention
- **Stream selector keyboard navigation** - Enhance UX with arrow key navigation and Enter/Escape shortcuts in stream selector
- **Stream selector search/filter** - Add search box to filter windows by name when many windows are open

### Priority 3 (Future Consideration)

- **Native system picker integration** - Investigate `useSystemPicker: true` option for Electron 38.x on Linux/macOS to reduce custom UI maintenance
- **Thumbnail preview optimization** - Lazy load thumbnails or use lower resolution to improve stream selector performance
- **Screensharing analytics** - Track screensharing usage patterns to inform future UX improvements
- **Multi-source sharing** - Investigate Electron API support for sharing multiple screens/windows simultaneously
- **Custom stream selector themes** - Allow users to customize stream selector appearance to match system theme

### Technical Debt Considerations

- **IPC security hardening** - Consider migrating to `contextIsolation: true` with contextBridge if Teams DOM access requirements change in future
- **Stream selector state management** - Refactor StreamSelector to use more robust state machine pattern for managing window lifecycle
- **Error boundary implementation** - Add comprehensive error handling and recovery for screensharing failures
- **Code duplication review** - Identify and consolidate any duplicate code between preview window and stream selector window creation
- **Electron API migration** - Monitor Electron deprecation warnings and proactively update APIs before they're removed in future versions

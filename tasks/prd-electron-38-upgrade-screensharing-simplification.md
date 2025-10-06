# Product Requirements Document: Electron 38 Upgrade with Screensharing Simplification

<!-- toc -->

## Introduction/Overview

This PRD outlines the upgrade of Teams for Linux from Electron 37.6.0 to Electron 38.2.1, coupled with a significant simplification of the screensharing implementation. The current screensharing system spans 9 files and uses deprecated/complex patterns (WebContentsView, setBrowserView). This upgrade will modernize the codebase, improve maintainability, and ensure compatibility with the latest Electron APIs while maintaining all existing screensharing functionality for users.

**Problem Statement:** The current implementation uses deprecated Electron APIs and overly complex architecture that increases maintenance burden and technical debt.

**Goal:** Upgrade to Electron 38.x and simplify screensharing code by ~30% while maintaining feature parity and ensuring zero functional regressions across all supported platforms.

## Goals

1. **Upgrade Electron** from ^37.6.0 to ^38.2.1 without breaking existing Teams functionality
2. **Simplify screensharing architecture** by consolidating code and replacing deprecated APIs
3. **Maintain feature parity** - all current screensharing capabilities must continue working
4. **Improve maintainability** by reducing complexity and file count
5. **Ensure cross-platform compatibility** on Linux (X11/Wayland), macOS, and Windows
6. **Zero regressions** - no degradation in existing functionality (including recent fixes like #1800)

## User Stories

1. **As a Teams for Linux user**, I want to share my screen during meetings so that I can collaborate effectively with my team, and this should work exactly as it does today.

2. **As a developer maintaining Teams for Linux**, I want a simpler screensharing codebase so that I can fix bugs and add features more quickly without navigating complex interdependencies.

3. **As a Linux user on Wayland**, I want screensharing to work reliably so that I can use the application on modern display servers.

4. **As a macOS user**, I want the app to continue working on macOS 12+ so that I can use Teams for Linux on recent Apple hardware.

5. **As a Windows user**, I want multi-monitor screensharing to continue working seamlessly so that I can share the correct display during presentations.

6. **As a power user**, I want to select specific windows or screens with thumbnail previews so that I can quickly choose the right content to share.

## Functional Requirements

### Electron Upgrade Requirements

1. The application MUST upgrade from Electron 37.6.0 to Electron 38.2.1
2. The application MUST maintain Teams login functionality across all platforms
3. The application MUST preserve all existing security configurations (contextIsolation: false, CSP, IPC validation)
4. The application MUST continue supporting macOS 12+ (dropping macOS 11 support is acceptable)
5. The application MUST update documentation to reference `XDG_SESSION_TYPE` instead of deprecated `ELECTRON_OZONE_PLATFORM_HINT`

### Screensharing Simplification Requirements

6. The application MUST maintain all current screensharing features:
   - Screen selection with thumbnails
   - Window selection with thumbnails
   - Preview window functionality
   - Custom UI picker (not system picker)
   - Multi-monitor support

7. The application MUST replace deprecated `setBrowserView()` API with modal BrowserWindow dialogs

8. The application MUST consolidate screensharing code while preserving functionality

9. The application MUST use the following Electron APIs (confirmed compatible in Electron 38.x):
   - `desktopCapturer.getSources()`
   - `session.setDisplayMediaRequestHandler()`
   - `BrowserWindow` for picker UI

10. The application MUST simplify IPC communication patterns where possible without removing functionality

### Quality Requirements

11. The application MUST pass `npm run lint` validation before commit
12. The application MUST be tested manually on Linux (X11 and Wayland), macOS, and Windows
13. The application MUST NOT introduce performance regressions (< 5% resource usage increase)
14. The application MUST NOT break recent bug fixes (e.g., audio echo fix #1800)

### Code Quality Requirements

15. The implementation MUST use `const`/`let` (NO `var`)
16. The implementation MUST use async/await patterns (not promise chains)
17. The implementation MUST follow existing error handling patterns with electron-log
18. The implementation MUST update `docs/ipc-api.md` if IPC channels change

## Non-Goals (Out of Scope)

1. **NOT** using native system picker (`useSystemPicker: true`) - maintaining custom UI
2. **NOT** removing any existing screensharing features (thumbnails, preview, window selection)
3. **NOT** adding new screensharing features beyond what currently exists
4. **NOT** fixing unrelated bugs (focus only on upgrade + simplification)
5. **NOT** changing user-facing UX beyond minor acceptable differences
6. **NOT** implementing automated tests (manual testing only for this phase)
7. **NOT** supporting macOS 11 (Big Sur) - minimum macOS 12 required
8. **NOT** creating a beta release or feature flags - direct release after testing

## Design Considerations

### Current Architecture Issues

The existing screensharing implementation has the following complexity:

```
Current: 9 files for screensharing
- Uses deprecated setBrowserView() API
- WebContentsView overlay system
- Multiple IPC channels: selected-source, close-view, screen-sharing-started/stopped
- Complex preview window creation logic with potential race conditions
```

### Proposed Simplification

**Replace:** WebContentsView + setBrowserView pattern
**With:** Modal BrowserWindow dialogs

**Example Pattern:**
```javascript
// OLD: WebContentsView with setBrowserView
window.setBrowserView(view)

// NEW: Modal BrowserWindow
const picker = new BrowserWindow({
  parent: mainWindow,
  modal: true,
  // ... modern options
})
```

### UI/UX Guidelines

- Custom picker UI must remain visually consistent with current implementation
- Thumbnail generation and preview windows must continue working
- Modal dialogs should feel native to each platform
- No noticeable performance degradation in picker responsiveness

## Technical Considerations

### Compatibility Matrix

| Feature | Current Implementation | Electron 38.x Status | Action Required |
|---------|----------------------|---------------------|-----------------|
| `desktopCapturer.getSources()` | ✅ Used extensively | ✅ Compatible | None |
| `session.setDisplayMediaRequestHandler()` | ✅ Used in main flow | ✅ Compatible | None |
| `BrowserWindow` creation | ✅ Standard usage | ✅ Compatible | None |
| `WebContentsView` | ⚠️ Used in StreamSelector | ✅ Compatible | Modernize usage |
| `setBrowserView()` | ❌ Deprecated usage | ⚠️ Still available but deprecated | Replace with modal BrowserWindow |
| IPC Security validation | ✅ Custom implementation | ✅ Compatible | None |

### Breaking Changes to Address

From Electron 38.x release notes:

1. **REMOVED:** `ELECTRON_OZONE_PLATFORM_HINT` environment variable
   - **Action:** Update documentation to reference `XDG_SESSION_TYPE=wayland`

2. **REMOVED:** macOS 11 support
   - **Action:** Update minimum requirements documentation

3. **BEHAVIOR CHANGE:** `window.open` popups always resizable
   - **Action:** Use `setWindowOpenHandler` if specific resizable behavior needed

4. **DEPRECATED (but still available):** `webFrame.routingId`, `webFrame.findFrameByRoutingId()`
   - **Impact:** None - not used in current codebase

### Security Considerations

Current security configuration MUST be maintained:

```javascript
webPreferences: {
  contextIsolation: false,  // Required for Teams DOM access - DO NOT CHANGE
  nodeIntegration: false,   // Secure: maintain this
  sandbox: false,           // Required for system API access - DO NOT CHANGE
}
```

CSP and IPC validation layers remain as compensating security controls.

### Platform-Specific Notes

**Linux:**
- Test on both X11 and Wayland
- Verify `XDG_SESSION_TYPE` documentation update
- Ensure PipeWire compatibility maintained

**macOS:**
- Update minimum version to macOS 12
- Verify screen recording permissions flow still works
- Test on both Intel and Apple Silicon if possible

**Windows:**
- Verify DWM integration remains functional
- Test multi-monitor scenarios thoroughly

### File Structure Impact

**Current screensharing files (9 total):**
- Location: `app/browser/`, `app/screenSharing/`, etc.
- Target: Consolidate while preserving functionality

**Strategy:**
- Reduce architectural complexity, not necessarily file count
- Prioritize code clarity and maintainability
- Remove duplicate IPC handling patterns

## Success Metrics

### Technical Success Criteria

1. ✅ **Zero regressions** in core Teams functionality (login, meetings, chat, notifications)
2. ✅ **Screensharing works** on all supported platforms (Linux X11/Wayland, macOS 12+, Windows)
3. ✅ **No performance degradation** (< 5% resource usage change in before/after comparison)
4. ✅ **Code reduction** achieved (target: 30% fewer lines in screensharing modules, measured by total SLOC)
5. ✅ **Linting passes** with `npm run lint` with zero errors
6. ✅ **No deprecated API warnings** in Electron console related to screensharing code

### User Experience Success Criteria

1. ✅ **Screensharing UX maintained** - users can select screens/windows with thumbnails as before
2. ✅ **Preview functionality works** - preview window displays selected source correctly
3. ✅ **Multi-monitor support** - all monitors appear in selection UI
4. ✅ **No new crashes** - application stability maintained or improved

### Process Success Criteria

1. ✅ **Single PR delivery** - Electron upgrade and screensharing simplification in one PR
2. ✅ **Documentation updated** - `docs/ipc-api.md` reflects any IPC changes
3. ✅ **Manual testing completed** on all three platforms before merge
4. ✅ **Recent fixes preserved** - audio echo fix (#1800) and other recent patches still work

## Testing Strategy

### Manual Testing Checklist

#### Core Functionality (All Platforms)
- [ ] Application launches successfully
- [ ] Teams login flow works (SSO and standard)
- [ ] Main Teams interface loads and is functional
- [ ] System tray integration works
- [ ] Notifications display correctly

#### Screensharing Tests (All Platforms)
- [ ] Open screensharing picker during Teams meeting
- [ ] Verify all screens appear with thumbnails
- [ ] Verify all windows appear with thumbnails
- [ ] Select a screen and verify preview window shows correct content
- [ ] Select a window and verify preview window shows correct content
- [ ] Successfully share screen in Teams meeting
- [ ] Successfully share window in Teams meeting
- [ ] Stop screensharing gracefully
- [ ] Test with multiple monitors (if available)

#### Platform-Specific Tests

**Linux X11:**
- [ ] Screen capture works without permission issues
- [ ] Multi-monitor detection accurate

**Linux Wayland:**
- [ ] PipeWire integration functional
- [ ] Screen capture permissions flow works
- [ ] No regressions from audio echo fix (#1800)

**macOS 12+:**
- [ ] Screen recording permissions prompt appears (first run)
- [ ] Permissions persistence works
- [ ] Native window thumbnails render correctly

**Windows:**
- [ ] DWM integration works
- [ ] Multi-monitor scenarios handled correctly
- [ ] Window preview thumbnails accurate

#### Performance Testing
- [ ] Measure memory usage before/after upgrade (target: < 5% increase)
- [ ] Measure CPU usage during screensharing (target: no regression)
- [ ] Verify screensharing picker opens within 2 seconds

#### Regression Testing
- [ ] Audio echo fix (#1800) still works on Wayland/PipeWire
- [ ] Custom background functionality unchanged
- [ ] Notification sounds work
- [ ] Tray icon badge count displays correctly
- [ ] All recent features from v2.5.9+ still functional

## Implementation Phases

### Phase 1: Electron Upgrade (Days 1-2)
- Update `package.json` to `"electron": "^38.2.1"`
- Run `npm install` and resolve any dependency conflicts
- Test basic application launch on all platforms
- Verify Teams login and core features work
- Document any breaking changes encountered
- Ensure `npm run lint` passes

### Phase 2: Screensharing Modernization (Days 2-4)
- Audit current screensharing files and identify deprecated API usage
- Replace `setBrowserView()` with modal `BrowserWindow` approach
- Simplify IPC communication patterns (maintain functionality)
- Consolidate duplicate code and remove unnecessary abstractions
- Test screensharing on primary platform (Linux) continuously
- Update `docs/ipc-api.md` if IPC channels modified

### Phase 3: Cross-Platform Testing & Validation (Days 4-5)
- Comprehensive manual testing on Linux (X11 and Wayland)
- macOS testing (verify macOS 12+ compatibility)
- Windows testing (multi-monitor scenarios)
- Performance benchmarking (memory, CPU)
- Regression testing for recent fixes (#1800, etc.)
- Final lint validation

### Phase 4: Documentation & PR (Day 6)
- Update `XDG_SESSION_TYPE` references in documentation
- Update minimum macOS version requirements
- Document architectural changes in commit messages
- Create PR with detailed testing notes
- Add "tested on" badges for each platform

## Open Questions

1. **WebContentsView Necessity:** You asked "Is there a reason why we need both [WebContentsView and BrowserWindow]?" - Investigation needed during implementation to determine if WebContentsView provides unique functionality or can be fully replaced by modal BrowserWindow dialogs.

2. **IPC Channel Consolidation:** Can `selected-source`, `close-view`, and `screen-sharing-started/stopped` channels be consolidated into fewer channels without breaking functionality?

3. **Preview Window Architecture:** Is the preview window creation logic overly complex due to WebContentsView usage, and would modal BrowserWindow simplify it?

4. **File Count Target:** Should we aim for a specific file count reduction (9 → 3-4) or focus purely on code complexity reduction regardless of file count?

5. **Electron Builder Compatibility:** Are there any electron-builder configuration changes needed for Electron 38.x packaging on Linux (AppImage, deb, rpm, snap)?

6. **Dependency Updates:** Should other Electron-ecosystem dependencies be updated in the same PR, or strictly limit to Electron core upgrade?

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|---------|---------------------|
| Screensharing breaks on Wayland | Low | High | Thorough Wayland testing; verify PipeWire integration unchanged |
| Teams DOM access fails | Low | Critical | Keep `contextIsolation: false`; extensive Teams feature testing |
| Modal dialogs look non-native | Medium | Low | Platform-specific styling; user acceptance within "minor UX differences" |
| Performance regression | Low | Medium | Before/after benchmarks; optimize if > 5% increase detected |
| Packaging issues with electron-builder | Low | Medium | Test dist builds early; verify AppImage/deb/rpm/snap generation |
| macOS 12+ compatibility issues | Low | Medium | Test on macOS 12, 13, 14 if possible; verify permissions flow |

## Definition of Done

This feature is considered complete when:

1. ✅ Electron upgraded to ^38.2.1 in package.json
2. ✅ Application builds successfully on all platforms
3. ✅ All manual testing checklist items pass
4. ✅ `npm run lint` passes with zero errors
5. ✅ Performance metrics show < 5% regression
6. ✅ Code review completed and approved
7. ✅ Documentation updated (XDG_SESSION_TYPE, macOS minimum version)
8. ✅ PR merged to main branch
9. ✅ No P0/P1 bugs reported in post-merge smoke testing

---

## References

- **Migration Analysis:** `/home/ismael/projects/github/teams-for-linux-electron-upgrade/ELECTRON_38_MIGRATION_ANALYSIS.md`
- **Electron 38.x Release Notes:** https://www.electronjs.org/blog/electron-38-0
- **Current Electron Version:** 37.6.0
- **Target Electron Version:** 38.2.1
- **Related Issues:** #1800 (audio echo fix - must not regress)

---

*Last Updated: 2025-10-06*
*Created By: AI Assistant per create-prd.instructions.md*
*Status: Draft - Awaiting Review*

# Tasks: Fix Wayland Screenshare Preview Window

Based on PRD: [prd-wayland-screenshare-preview-fix.md](prd-wayland-screenshare-preview-fix.md)

## System Analysis

### ADR Review

No formal Architecture Decision Records (ADRs) found in `docs/adr/`. However, the codebase follows these implicit architectural decisions:

- **IPC Communication Pattern**: Use of `ipcMain.on` for notifications and `ipcMain.handle` for request-response patterns
- **Global State Management**: Screen sharing state stored in `global.selectedScreenShareSource`
- **Diagnostic Logging**: Consistent use of `[SCREEN_SHARE_DIAG]` prefix for screen sharing related logs
- **Code Style**: Use of `const`/`let` (no `var`), async/await patterns, private fields with `#` syntax

### Documentation Review

From `app/screenSharing/README.md`:
- StreamSelector expects source IDs in format `screen:x:0` or `window:x:0` (line 73-74 of `app/screenSharing/index.js`)
- desktopCapturer.getSources() provides source objects with `id`, `name`, `thumbnail`, and other properties
- The module bridges Teams web app with Electron's native desktopCapturer API
- Platform differences documented for X11 vs Wayland (X11 is more permissive, Wayland requires strict format)

### Pattern Analysis

**Current Screen Sharing Flow:**
1. User clicks "Share" in Teams → triggers `setDisplayMediaRequestHandler` (app/mainAppWindow/index.js)
2. StreamSelector.show() displays source picker
3. User selects source → `setupScreenSharing(selectedSource)` called (app/mainAppWindow/index.js:226)
4. **Line 228**: `global.selectedScreenShareSource = selectedSource` stores desktopCapturer source object
5. **Line 231**: `createScreenSharePreviewWindow()` creates preview window
6. Electron creates MediaStream from selected source
7. **injectedScreenSharing.js:113-119**: Intercepts stream, sends IPC with `stream.id` (UUID)
8. **app/index.js:162**: IPC handler **OVERWRITES** `global.selectedScreenShareSource` with UUID
9. Preview window tries to use UUID → fails on Wayland

**Key Pattern Identified**: The bug occurs because step 8 overwrites the correct value set in step 4.

### Conflicts and Constraints

**Conflict**: Two different processes setting `global.selectedScreenShareSource`:
- `setupScreenSharing()` sets it correctly (desktopCapturer source object/id)
- `screen-sharing-started` IPC handler overwrites it incorrectly (MediaStream UUID)

**Constraint**: The `injectedScreenSharing.js` runs in the renderer process and does NOT have access to the desktopCapturer source object - it only receives the MediaStream after creation.

**Resolution Strategy**: Prevent the IPC handler from overwriting the correct value by either:
1. Not sending sourceId from renderer process, OR
2. Only updating global state if received value is in correct format

### Research Spikes Identified

No research spikes required - this is a straightforward bug fix with clear root cause.

## Relevant Files

### Files Modified

- `app/screenSharing/injectedScreenSharing.js` - Removed stream.id UUID logic, now sends null to preserve desktopCapturer source ID
- `app/index.js` - Added validation to `screen-sharing-started` IPC handler to prevent overwriting with invalid format
- `app/screenSharing/README.md` - Added documentation about source ID format requirement and ADR reference
- `docs/adr/001-use-desktopcapturer-source-id-format.md` - Created ADR documenting the technical decision

### Files Already Correct (No Changes)

- `app/mainAppWindow/index.js` - Line 228 already stores correct source object
- `app/screenSharing/previewWindow.html` - Already uses sourceId correctly, just needs correct value
- `app/screenSharing/index.js` - StreamSelector already expects correct format

### Notes

- Run `npm run lint` before committing
- Test on both Wayland (`XDG_SESSION_TYPE=wayland`) and X11 (`XDG_SESSION_TYPE=x11`)
- No automated tests exist for this module - rely on manual testing
- Follow existing diagnostic logging patterns with `[SCREEN_SHARE_DIAG]` prefix

## Tasks

- [x] 1.0 Fix source ID handling in renderer process (injectedScreenSharing.js)
  - [x] 1.1 Remove the sourceId calculation from lines 113-115 (stream.id logic)
  - [x] 1.2 Update line 119 to send `null` instead of `sourceId` to `sendScreenSharingStarted()`

- [x] 2.0 Add validation to IPC handler to prevent incorrect overwrites
  - [x] 2.1 In `app/index.js` line 162, check if `sourceId` is null before updating
  - [x] 2.2 If `sourceId` is not null, validate it matches format `screen:x:y` or `window:x:y`
  - [x] 2.3 Only update `global.selectedScreenShareSource` if validation passes
  - [x] 2.4 Log warning if UUID format detected (helps catch future regressions)

- [x] 3.0 Update diagnostic logging for better debugging
  - [x] 3.1 Log the received sourceId vs existing sourceId in IPC handler
  - [x] 3.2 Add log in injectedScreenSharing.js showing we're NOT sending stream.id
  - [x] 3.3 Update existing log at line 166 to show validation result

- [x] 4.0 Create ADR and update documentation
  - [x] 4.1 Create `docs/adr/` directory if it doesn't exist
  - [x] 4.2 Create ADR documenting decision to use desktopCapturer source ID format (`screen:x:y` or `window:x:y`)
  - [x] 4.3 ADR should explain: why MediaStream.id (UUID) cannot be used, Wayland requirements, and impact on preview window
  - [x] 4.4 Update `app/screenSharing/README.md` referencing the ADR

- [x] 5.0 Manual testing on Wayland and X11
  - [x] 5.1 Test on Wayland: Start screenshare, verify preview opens, check console for `screen:x:y` format
  - [x] 5.2 Test on X11: Start screenshare, verify no regression, preview still works
  - [x] 5.3 Test multiple screens on both platforms
  - [x] 5.4 Test window sharing on both platforms
  - [x] 5.5 Run `npm run lint` and fix any violations
  - [x] 5.6 Verify console logs show correct source ID format (not UUID)

## Future Improvements

### Priority 2 (Nice-to-Have)

- Refactor global state management into a proper ScreenSharingManager class to encapsulate `global.selectedScreenShareSource` and related state

### Technical Debt Considerations

- Global state management (`global.selectedScreenShareSource`) should be encapsulated in a dedicated module

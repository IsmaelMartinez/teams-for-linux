# Screen Sharing Implementation Analysis

## Executive Summary

The current screen sharing implementation suffers from **dual interception strategies** and **IPC channel mismatches** that cause unresponsive selection UI and hung promises. Analysis confirms the root causes identified in PRD issue #1743.

## Current Architecture Issues

### 1. Dual Interception Conflict ⚠️
**Problem**: Both legacy and modern capture paths are active simultaneously.

- **Legacy Path**: `app/browser/tools/chromeApi.js:14-16` overrides `MediaDevices.prototype.getDisplayMedia` on X11
- **Modern Path**: `app/mainAppWindow/index.js:79-102` uses `session.setDisplayMediaRequestHandler`
- **Result**: Conflicting interception causes unpredictable behavior

### 2. IPC Channel Mismatch ❌ 
**Critical Issue**: Channel name inconsistency creates unresolved promises.

- **Send**: `chromeApi.js:37` sends `select-source`
- **Listen**: `chromeApi.js:34` waits for response on `select-source` 
- **Reply**: `browserWindowManager.js:98` replies on `select-source`
- **StreamSelector**: `streamSelector/index.js:80` expects `selected-source` ≠ `select-source`
- **Result**: Promise never resolves, UI hangs indefinitely

### 3. Legacy Constraints in Pop-out Preview
**File**: `app/inAppUI/callPopOut.html:45-53`
```javascript
video: {
    mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
    }
}
```
- Uses deprecated `mandatory` constraints
- No fallback for newer Electron/Chromium versions
- Fixed constraints instead of dynamic adaptation

### 4. StreamSelector Implementation Issues
**File**: `app/streamSelector/index.js`
- Uses deprecated `setBrowserView` (line 86) 
- `ipcMain.once()` listeners prone to race conditions (line 80-81)
- Manual view cleanup without proper error handling (lines 85-95)
- No timeout mechanism for hung selection UI

## Environment Details
- **Electron Version**: 37.2.4 (`package.json:58`)  
- **Context Isolation**: **DISABLED by default** (`config/index.js:194-199`, `browserWindowManager.js:75`)
- **Sandbox**: **DISABLED by default** (`config/index.js:395-399`, `browserWindowManager.js:76`)
- **Target Platforms**: X11 (legacy override) + Wayland (native getDisplayMedia)

## Critical Discovery ⚠️
The project defaults to `contextIsolation: false` and `sandbox: false`. This explains why:
- Legacy `chromeApi.js` override works (direct window access)
- Modern `setDisplayMediaRequestHandler` may receive malformed request objects
- "Display media request has no URL" errors occur with modern handler

## Recommended Solution Path ✅ IMPLEMENTED
1. **Smart Strategy Selection**: Auto-detect based on `contextIsolation` setting
   - `contextIsolation: false` → Use legacy override (compatible with current defaults)
   - `contextIsolation: true` → Use modern `setDisplayMediaRequestHandler`
2. **Fix IPC Channels**: Standardized on unified channel names ✅
3. **Modern Constraints**: Replace `mandatory`/`chromeMediaSource` with modern patterns (future task)
4. **Add Timeouts**: Implemented 8s timeout with structured logging ✅

## References
- **PRD**: `tasks/prd-reliable-modernized-screen-sharing.md`
- **Issue**: #1743 - Cannot share screen – selection UI unresponsive
- **Key Files**:
  - `app/browser/tools/chromeApi.js` - Legacy override implementation
  - `app/mainAppWindow/index.js:79-102` - Modern handler implementation  
  - `app/streamSelector/index.js` - Selection UI component
  - `app/mainAppWindow/browserWindowManager.js:84,94-101` - IPC handlers
  - `app/inAppUI/callPopOut.html:45-53` - Pop-out preview constraints
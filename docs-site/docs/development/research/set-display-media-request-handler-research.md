# setDisplayMediaRequestHandler Research

:::info Ready for Implementation
Research complete. This resolves the conflict between issues #2169 (camera broken) and #2217 (screen sharing broken) that cannot be fixed by toggling `--use-fake-ui-for-media-stream`.
:::

**Date:** 2026-02-23
**Current Version:** Electron 39.5.1 (Chromium 142)
**Related Issues:** [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169), [#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217), [#2222](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222), [#2204](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204), [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Related Audit:** [Wayland Optimizations Audit](wayland-optimizations-audit.md)

---

## Problem Statement

The project is caught in a direct conflict between two bugs driven by the same flag:

- `--use-fake-ui-for-media-stream` **enabled on XWayland** → screen sharing works (#2217 fixed), but camera breaks (#2169 reintroduced). The GPU context provider in the video capture service fails to bind (`Bind context provider failed`).
- `--use-fake-ui-for-media-stream` **disabled on XWayland** (current state) → camera works (#2169 fixed), but screen sharing breaks (#2217). Chromium shows its own internal dialog for `getDisplayMedia()`, which either fails silently or fires duplicate xdg-desktop-portal requests on top of the app's custom source picker.

PR #2219 proposes re-enabling the flag for XWayland to fix #2217, but this directly reintroduces #2169. The flag is a blunt instrument: it applies to every media device request (`getUserMedia` for camera/mic and `getDisplayMedia` for screen sharing) with no way to distinguish between them at the flag level.

The correct fix is `session.setDisplayMediaRequestHandler()`, which intercepts only `getDisplayMedia()` at the Electron main-process level, leaving camera/mic permissions entirely unaffected.

---

## Current Screen Sharing Architecture

Understanding the current flow is essential before changing it.

When the user initiates screen sharing in Teams, the following chain fires:

1. Teams web app calls `navigator.mediaDevices.getDisplayMedia()`
2. `injectedScreenSharing.js` intercepts the call (wrapping the original), disables audio in constraints, then calls `originalGetDisplayMedia(constraints)`
3. Without `--use-fake-ui-for-media-stream`, Chromium shows its own permission/picker dialog at this point — which breaks under XWayland
4. Separately, the app's `StreamSelector` (`app/screenSharing/index.js`) renders a `WebContentsView` overlay at the bottom of the main window, populated via `desktopCapturer.getSources()` over IPC
5. The user selects a source; `selected-source` IPC fires; `StreamSelector` invokes its callback
6. The selected `source.id` is passed back through the renderer to Teams' `getUserMedia()` call as a `chromeMediaSourceId`

The custom picker UI (step 4) and the `getDisplayMedia()` call (step 2–3) are currently decoupled. The flag was the glue that suppressed Chromium's dialog so step 3 didn't interfere with step 4.

`session.setDisplayMediaRequestHandler()` replaces step 3 entirely by handling the request at the Electron main-process level before Chromium ever tries to show a dialog.

---

## What `session.setDisplayMediaRequestHandler()` Does

Added in Electron 17 (well-established by Electron 39), this API registers a handler that is called whenever web content in the session calls `navigator.mediaDevices.getDisplayMedia()`.

```javascript
session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  // request.frame — the WebFrameMain that made the request
  // callback({ video, audio }) — supply the stream source
  // callback(null) — deny the request
});
```

The `video` argument to the callback can be a `DesktopCapturerSource` object (as returned by `desktopCapturer.getSources()`), or a `WebFrameMain` for tab capture. When the handler is registered, Chromium's built-in display media dialog is completely suppressed — no permission bubble, no PipeWire portal dialog from this path. The handler owns the decision entirely.

This is exactly what the project needs: screen sharing goes through the handler (no dialog, no portal conflict), while camera/mic continue through the normal `getUserMedia()` permission path (GPU context binding intact, #2169 not reintroduced).

---

## Proposed Implementation

### Phase 1: Wire Up the Handler

Register the handler during app initialization (in `app/mainAppWindow/index.js` or a dedicated `app/screenSharing/` setup, wherever `ScreenSharingService` is initialized).

```javascript
const { session, desktopCapturer } = require('electron');

session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    if (!sources || sources.length === 0) {
      callback(null);
      return;
    }
    const chosen = await screenSharingService.showPicker(sources);
    if (!chosen) {
      callback(null);
      return;
    }
    callback({ video: chosen });
  } catch (err) {
    console.error('[SCREEN_SHARE] setDisplayMediaRequestHandler error:', err.message);
    callback(null);
  }
});
```

The `showPicker()` call reuses the existing `StreamSelector` / `#showScreenPicker` infrastructure from `ScreenSharingService` — no new UI needed.

### Phase 2: Remove `--use-fake-ui-for-media-stream`

Once the handler is wired up, `getDisplayMedia()` never reaches Chromium's dialog, so the flag is no longer needed for screen sharing on any display mode. It can be removed from `commandLine.js` entirely (both the `!isX11Forced` conditional and any remaining native Wayland usage).

### Phase 3: Simplify `injectedScreenSharing.js`

The `getDisplayMedia` intercept in `injectedScreenSharing.js` (lines 55–75) was originally needed to monitor stream lifecycle and disable audio. With the handler in place:

- Audio disabling can be done in the handler itself by passing `{ video: chosen, audio: false }` to the callback, or by stripping audio tracks server-side — no renderer-side intercept needed for that
- Stream lifecycle monitoring (detecting when sharing stops) still needs to happen somewhere. The handler callback receives the `MediaStream` once the source is returned, so track `ended` events can be set up there or via the existing IPC `screen-sharing-stopped` path

The `getUserMedia` intercept (lines 77–121) handles the fallback detection path for when Teams uses the older `chromeMediaSourceId` constraint format. That path is independent and can remain as-is.

---

## Interaction with Existing IPC Flow

The current `choose-desktop-media` IPC handler in `ScreenSharingService` (`#handleChooseDesktopMedia`) already does source enumeration and picker invocation. The `setDisplayMediaRequestHandler` approach supersedes this IPC path for the primary Wayland/XWayland flow — Teams' `getDisplayMedia()` call is intercepted before it ever sends IPC, so `choose-desktop-media` would become dead code for that path. It can be retained as a fallback or removed in a follow-up cleanup.

---

## Related Open Issues

Several open issues are directly affected by this change.

**Fixes expected from `setDisplayMediaRequestHandler`:**

[#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217) (screen sharing broken on Wayland/XWayland) is the primary motivation. The handler bypasses the Chromium dialog that breaks on XWayland without needing the conflicting `--use-fake-ui-for-media-stream` flag.

[#2204](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204) (no thumbnail window when sharing on native Wayland) is likely a downstream effect of #2217 — if screen sharing never actually starts, the thumbnail never opens. Fixing the underlying screen sharing flow should resolve this. Worth verifying specifically under `--ozone-platform=wayland`.

**Likely related but requires separate attention:**

[#2222](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222) (microphone not working in v2.7.5) almost certainly broke for the same reason as #2217 — both broke in v2.7.5 when `--use-fake-ui-for-media-stream` was removed from XWayland. However, microphone goes through `getUserMedia()`, not `getDisplayMedia()`, so `setDisplayMediaRequestHandler` does not cover it. The fix for microphone is `session.setPermissionRequestHandler()` granting the `media` permission type programmatically — this auto-approves the `getUserMedia()` permission request at the Electron layer without touching Chromium's media stream internals and without the GPU context side effects that `--use-fake-ui-for-media-stream` causes. The two handlers together (`setDisplayMediaRequestHandler` for screen sharing, `setPermissionRequestHandler` for camera/mic) would allow `--use-fake-ui-for-media-stream` to be removed entirely.

**Must not regress:**

[#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) (MQTT screen sharing status) depends on `screen-sharing-started` and `screen-sharing-stopped` IPC events being fired from `injectedScreenSharing.js`. The `setDisplayMediaRequestHandler` implementation must ensure these IPC events still fire — either by keeping the JS-level stream monitoring in `injectedScreenSharing.js` intact (which continues to intercept the resolved `getDisplayMedia()` promise), or by emitting the events explicitly from the handler callback.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Teams uses a `getDisplayMedia` variant the handler doesn't intercept | Low | High | Test thoroughly; the handler intercepts all `getDisplayMedia()` calls in the session |
| Stream lifecycle detection breaks without the JS intercept | Medium | Medium | Retain track `ended` event monitoring; add IPC notification from handler |
| Audio leaking into screen share streams | Low | Low | Pass `audio: false` in handler callback |
| Handler not called in nested frames (iframes) | Low | Low | Teams runs in the top-level frame; `request.frame` can be inspected to verify |
| Regression on X11 (non-Wayland) sessions | Low | Medium | Handler is session-wide, not Wayland-specific — test on X11 too |

---

## Testing Checklist

- [ ] Screen sharing works on XWayland (`--ozone-platform=x11`)
- [ ] Screen sharing works on native Wayland (`--ozone-platform=wayland`)
- [ ] Screen sharing works on X11 sessions (non-Wayland)
- [ ] Camera works during meetings on XWayland (regression check for #2169)
- [ ] Microphone works during meetings on XWayland (regression check for #2222)
- [ ] Screen sharing thumbnail preview opens and closes correctly (regression check for #2204)
- [ ] Cancelling the picker (no source selected) does not hang the call
- [ ] `screen-sharing-started` and `screen-sharing-stopped` IPC events fire correctly (required by MQTT status #2107)
- [ ] No duplicate portal dialogs on Wayland
- [ ] No Chromium permission bubble appears during screen share flow

---

## References

- [Electron `session.setDisplayMediaRequestHandler()` API docs](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequest-handler-handler)
- [Electron `session.setPermissionRequestHandler()` API docs](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler)
- [Issue #2217 - Screen sharing broken on Wayland/XWayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217)
- [Issue #2222 - Microphone not working in v2.7.5](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222)
- [Issue #2204 - No thumbnail window when sharing on native Wayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204)
- [Issue #2169 - Camera broken under XWayland with GPU disabled](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)
- [Issue #2107 - MQTT screen sharing status](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
- [PR #2219 - Screen sharing regression fix (do not merge as-is)](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219)
- [PR #2190 - Fix: keep GPU enabled under XWayland](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190)
- [Wayland Optimizations Audit](wayland-optimizations-audit.md)
- [ADR-008 - useSystemPicker rejection](../adr/008-usesystempicker-electron-38.md)

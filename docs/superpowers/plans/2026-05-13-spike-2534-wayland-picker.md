# Spike: Wayland in-app screen-share picker (#2534)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify whether routing `getDisplayMedia` through TFL's in-app `StreamSelector` (instead of Chromium's native handler) on Wayland restores the screen-share preview window without breaking screen capture itself.

**Architecture:** On Wayland with `WebRTCPipeWireCapturer` enabled (TFL's default), Chromium's native `getDisplayMedia` handles source selection via xdg-desktop-portal and bypasses Electron's `setDisplayMediaRequestHandler`. The preview window only fires from the in-app picker path. Spike intercepts `getDisplayMedia` in the injected renderer script: calls a new IPC to show `StreamSelector`, receives the chosen source ID, then synthesises the media stream via `getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId } } })` — the same constraint shape the preview window already uses successfully on Wayland (`app/screenSharing/previewWindow.html:68-69`).

**Tech Stack:** Electron, WebRTC `getUserMedia` with legacy `chromeMediaSource: 'desktop'` constraint, existing `StreamSelector` BrowserWindow.

**Out of scope (deliberately, this is a spike):** config flag, per-profile session handling (multi-account), automated tests, X11 fallback (in-app picker already works there via the existing handler, but the renderer intercept here will run on X11 too and we want to know if that itself breaks anything).

---

## File Structure

- `app/screenSharing/injectedScreenSharing.js` — wrap `getDisplayMedia` to call our IPC first, then use `getUserMedia` with the chosen source ID
- `app/mainAppWindow/index.js` — register a new IPC handler `show-tfl-stream-picker` that wraps `streamSelector.show()` + `handleScreenSourceSelection` and returns the chosen source ID (or null on cancel)
- `app/browser/preload.js` — expose `electronAPI.showTflStreamPicker()`
- `app/security/ipcValidator.js` — add `show-tfl-stream-picker` to the screen-sharing allowlist

## Tasks

### Task 1: Add IPC channel to allowlist

**Files:**
- Modify: `app/security/ipcValidator.js` (screen sharing alphabetical block)

- [ ] **Step 1: Add the channel name**

Insert `'show-tfl-stream-picker'` into the screen-sharing block in `allowedChannels`, keeping alphabetical order.

- [ ] **Step 2: Commit**

```bash
git add app/security/ipcValidator.js
git commit -m "chore(security): allowlist show-tfl-stream-picker IPC for spike #2534"
```

### Task 2: Expose IPC method on electronAPI

**Files:**
- Modify: `app/browser/preload.js` (electronAPI block)

- [ ] **Step 1: Add the method**

Add to electronAPI:

```js
// Spike #2534: ask main to show the in-app StreamSelector and return the chosen source ID.
showTflStreamPicker: () => ipcRenderer.invoke("show-tfl-stream-picker"),
```

- [ ] **Step 2: Commit**

```bash
git add app/browser/preload.js
git commit -m "feat(preload): expose showTflStreamPicker for spike #2534"
```

### Task 3: Register main-process IPC handler

**Files:**
- Modify: `app/mainAppWindow/index.js` (near the existing `setDisplayMediaRequestHandler` registration)

- [ ] **Step 1: Add the handler**

Register `ipcMain.handle("show-tfl-stream-picker", ...)` that:
- Returns a Promise that resolves with the chosen source ID, or null on cancel
- Wraps `streamSelector.show(callback)` and on a non-null source, calls `handleScreenSourceSelection(source, () => resolve(source.id))` to trigger `setupScreenSharing` (which creates the preview window)

```js
// Spike #2534: alternative entry point to the in-app StreamSelector for the
// Wayland case, where setDisplayMediaRequestHandler is bypassed by Chromium's
// native getDisplayMedia + WebRTCPipeWireCapturer. Returns the chosen source
// ID so the renderer can synthesise the stream via getUserMedia.
ipcMain.handle("show-tfl-stream-picker", () =>
  new Promise((resolve) => {
    streamSelector.show((source) => {
      if (!source) {
        resolve(null);
        return;
      }
      handleScreenSourceSelection(source, () => resolve(source.id));
    });
  })
);
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/mainAppWindow/index.js
git commit -m "feat(screenSharing): add show-tfl-stream-picker IPC handler for spike #2534"
```

### Task 4: Intercept getDisplayMedia in the renderer

**Files:**
- Modify: `app/screenSharing/injectedScreenSharing.js` (lines 60-81)

- [ ] **Step 1: Replace the getDisplayMedia wrapper**

Change the wrapper so it:
1. Calls `electronAPI.showTflStreamPicker()` first
2. If a source ID comes back, calls `originalGetUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id } } })`
3. If the picker returns null (user cancelled), throws a `DOMException('Permission denied', 'NotAllowedError')`
4. If the IPC itself errors (no `electronAPI`, etc.), falls back to `originalGetDisplayMedia(constraints)` so screen-share still works
5. On any successful stream, continues to call `handleScreenShareStream(stream, "getDisplayMedia-via-tfl")` so existing UI / IPC notification stays consistent

```js
navigator.mediaDevices.getDisplayMedia = function (constraints) {
  console.debug("[SCREEN_SHARE_DIAG] getDisplayMedia intercepted (spike #2534 path)");

  disableAudioInConstraints(constraints, "getDisplayMedia");

  const fallback = () => originalGetDisplayMedia(constraints)
    .then((stream) => {
      console.debug(`[SCREEN_SHARE_DIAG] Screen sharing started via getDisplayMedia native (${stream.getAudioTracks().length}a/${stream.getVideoTracks().length}v)`);
      handleScreenShareStream(stream, "getDisplayMedia");
      return stream;
    });

  const electronAPI = globalThis.electronAPI;
  if (!electronAPI?.showTflStreamPicker) {
    console.debug("[SCREEN_SHARE_DIAG] showTflStreamPicker unavailable, falling back to native");
    return fallback();
  }

  return electronAPI.showTflStreamPicker()
    .then((sourceId) => {
      if (!sourceId) {
        throw new DOMException("User cancelled screen share", "NotAllowedError");
      }
      console.debug(`[SCREEN_SHARE_DIAG] TFL picker returned source ${sourceId}, calling getUserMedia`);
      return originalGetUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
          },
        },
      });
    })
    .then((stream) => {
      console.debug(`[SCREEN_SHARE_DIAG] Screen sharing started via TFL picker (${stream.getAudioTracks().length}a/${stream.getVideoTracks().length}v)`);
      handleScreenShareStream(stream, "getDisplayMedia-via-tfl");
      return stream;
    })
    .catch((error) => {
      if (error?.name === "NotAllowedError") {
        throw error;
      }
      console.error(`[SCREEN_SHARE_DIAG] TFL picker path failed (${error?.name}/${error?.message}), falling back to native`);
      return fallback();
    });
};
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/screenSharing/injectedScreenSharing.js
git commit -m "spike(screenSharing): route getDisplayMedia through in-app picker for #2534"
```

### Task 5: Push branch and open draft PR

- [ ] **Step 1: Push**

```bash
git push -u origin spike/2534-wayland-in-app-picker
```

- [ ] **Step 2: Open draft PR**

```bash
gh pr create --draft --base main --title "spike(#2534): route getDisplayMedia through in-app picker" --body "<body with test plan>"
```

Body must include the link to #2534 (no `closes` keyword since this is a spike), the hypothesis, the build-artifact pointer, and the test plan for piotrleszczynski.

### Task 6: Comment on #2534 pointing to the build

- [ ] **Step 1: Post a comment on #2534**

Post a short comment asking piotrleszczynski to grab the PR-build artifact and test, with the exact path-to-test steps and what to look for in the log.

## Verification

Reporter test on Wayland session (KDE Plasma + xdg-desktop-portal-kde, TUXEDO OS):

1. Install the PR-build deb.
2. Launch normally (no `--ozone-platform=x11` needed).
3. Start or join a meeting.
4. Click Share → Screen.
5. Confirm the TFL in-app picker grid appears (NOT the KDE/portal native picker).
6. Pick a screen.
7. Confirm the small thumbnail preview window appears at bottom-right.
8. Confirm the actual share works in the meeting (other participants see the screen).
9. Click "Stop sharing" in the preview or in Teams; confirm preview window closes.

If steps 5 and 7 pass, the hypothesis is confirmed and we can promote this to a full feature (with config flag, multi-account session handling, X11 verification, tests). If step 5 fails, log analysis is needed. If step 8 fails, getUserMedia + `chromeMediaSource: 'desktop'` is not equivalent to native `getDisplayMedia` on Wayland for Teams' WebRTC pipeline, and the spike disproves the approach.

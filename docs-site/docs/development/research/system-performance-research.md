# System Performance Research

:::info Research Status
**Status:** Research complete, ready for implementation
**Date:** 2026-03-18
**Scope:** Renderer process overhead, main process I/O, network resilience, and resource management
:::

## Summary

An audit of the Teams for Linux codebase identified ten performance-sensitive patterns across
renderer-side browser tools, main-process I/O, and network handling. The findings are organized
by severity and include concrete recommendations. No performance metrics infrastructure exists
today, so a lightweight instrumentation layer is also proposed.

## Current Metrics Infrastructure

**There is none.** The codebase has:

- No `performance.mark()` / `performance.measure()` usage
- No `process.memoryUsage()` monitoring
- No startup time tracking (app ready, window load, Teams page load)
- No telemetry, profiling, or instrumentation of any kind

The only runtime observability is `electron-log` for structured logging and the
`chrome://gpu` diagnostics exposed via `gpuInfoWindow`.

## Findings

### HIGH — Renderer Process Overhead

#### 1. Continuous 1-second polling in timestampCopyOverride

**File:** `app/browser/tools/timestampCopyOverride.js:8`

```javascript
this.overrideInterval = setInterval(() => this.applyOverride(), 1000);
```

Every second, calls `ReactHandler._getTeams2CoreServices()` and multiple method overrides.
Does not terminate until the override succeeds — runs indefinitely if Teams never exposes the
API.

**Recommendation:** Replace with a `MutationObserver` or a one-shot check after the Teams
page fires its ready event. If polling is unavoidable, use exponential backoff capped at
30 seconds.

---

#### 2. Multiple full-subtree MutationObservers on document.body

Two independent MutationObservers both watch `document.body` with `{ childList: true, subtree: true }`:

| Observer | File | Lines | Extra |
|----------|------|-------|-------|
| MQTT status monitor | `app/browser/tools/mqttStatusMonitor.js` | 98–103 | Also polls every 10 s (line 114) |
| Screen sharing UI | `app/screenSharing/injectedScreenSharing.js` | 311–316 | Also polls every 5 s (line 335) |

Both observers use `attributeFilter` arrays to limit which attribute changes trigger callbacks
(MQTT filters on `class`, `aria-label`, `title`, `data-testid`; screen sharing on `class`,
`data-tid`, `title`, `aria-label`). This mitigates attribute-triggered overhead, but the
primary cost comes from `childList: true` combined with `subtree: true` — every node
insertion or removal anywhere in the page (React reconciliation, chat messages, presence
updates) fires callbacks for both observers. The Teams web app is mutation-heavy, so this
remains a significant source of overhead.

**Recommendation:**
- Consolidate into a single shared `MutationObserver` dispatcher that fans out to subscribers.
- Narrow observation scope — observe the smallest container that holds the relevant status
  elements instead of `document.body`.
- Remove the redundant periodic polling once observer reliability is confirmed, or keep it as
  a low-frequency fallback (30–60 s).

---

#### 3. Full button scan on every DOM mutation during screen sharing

**File:** `app/screenSharing/injectedScreenSharing.js:264–283`

The `processStopSharingButtons()` function is called on every mutation (via the observer above)
and also every 5 seconds. Its fallback path at line 278 runs
`document.querySelectorAll("button")`, scanning every button in the page.

**Recommendation:** Cache the last-known stop-sharing button reference and only re-scan when
it becomes detached. Use a more specific selector or `data-tid` attribute instead of matching
all buttons.

---

#### 4. Canvas and Image re-creation on every tray icon update

**File:** `app/browser/tools/trayIconRenderer.js:107–187`

Each activity count change triggers:
1. `document.createElement("canvas")` — line 110
2. `new Image()` — line 113
3. `this.baseIcon.toDataURL("image/png")` — line 115 (expensive serialization)
4. A second `document.createElement("canvas")` for resizing — line 175
5. `resizedCanvas.toDataURL()` — line 169

Total: 2 canvas creations, 2 `getContext("2d")` calls, 2 `toDataURL()` serializations per
update.

**Recommendation:** Cache the base icon `dataURL` string (it never changes). Reuse a single
offscreen canvas pair. Only re-render when `newActivityCount` differs from the last rendered
count (the outer check exists in the caller, but the render pipeline itself should also guard).

---

### MEDIUM — Main Process and I/O

#### 5. Recursive setTimeout without retry limits --- IMPLEMENTED

**File:** `app/browser/tools/shortcuts.js:49–55, 72–79`

Both `whenWindowReady()` and `whenIframeReady()` polled every 1 second with no maximum retry
count. If the window or iframe never appeared (e.g., a load failure), these polled forever.

**Fix applied:** Added `MAX_READY_RETRIES = 30` (30 seconds). Both functions now accept an
`attempt` counter and log a warning via `console.warn` when the limit is reached instead of
polling indefinitely.

---

#### 6. Sequential recursive directory traversal in cache manager

**File:** `app/cacheManager/index.js:221–257`

```javascript
for (const file of files) {
    const filePath = path.join(dirPath, file);
    totalSize += await this.getDirSize(filePath);  // sequential await
}
```

`getDirSize()` walks the cache tree one file at a time. Each entry requires a separate
`fsp.stat()` call. For a 600 MB cache with thousands of files, this blocks the event loop
with sequential I/O.

The `cleanDirectory()` method (line 181–216) has the same sequential pattern.

**Recommendation:** Use `Promise.all()` with a concurrency limiter (e.g., batches of 50) for
the `readdir` + `stat` calls. Alternatively, use `fsp.readdir({ withFileTypes: true })` to
avoid extra `stat` calls, then parallelize child directory traversal.

---

#### 7. Missing event listener cleanup on window close

**File:** `app/mainAppWindow/index.js`

Multiple `.on()` listeners are registered but never removed. Notably, listeners on global
singletons persist beyond window lifetime:

- `nativeTheme.on("updated", ...)` — line 590
- `powerMonitor.on("resume", ...)` — line 822
- `window.webContents.on("did-finish-load" | "did-frame-finish-load" | "did-navigate" | "did-navigate-in-page", ...)` — lines 845–852

The `onWindowClosed` handler (line 799) sets `window = null` and calls `app.quit()` but does
not remove any listeners. Since the app quits immediately this is benign in the current flow,
but the `nativeTheme` and `powerMonitor` listeners would leak if the window were ever
recreated without a full restart (e.g., after a crash recovery or future multi-window support).

**Recommendation:** Store listener references and call `removeListener()` in the window
`closed` event handler, particularly for global singleton listeners (`nativeTheme`,
`powerMonitor`).

---

#### 8. Up to 21 sequential network requests for offline detection

**File:** `app/connectionManager/index.js:148–200`

The `isOnline()` method tries four detection strategies sequentially:

| Method | Max tries | Sleep between | Worst-case time |
|--------|-----------|---------------|-----------------|
| HTTPS HEAD | 10 | 500 ms | 5 s |
| DNS resolve | 5 | 500 ms | 2.5 s |
| `net.isOnline()` | 5 | 500 ms | 2.5 s |
| None (fallback) | 1 | — | 0 s |

Worst-case: **10 seconds** of sequential blocking before declaring offline. This runs during
`refresh()` which blocks the UI reload.

**Recommendation:**
- Run the three real methods in parallel via `Promise.any()` — return `true` as soon as any
  succeeds.
- Reduce HTTPS retries from 10 to 3 (the DNS and native checks provide redundancy).
- Add request timeouts to `net.request()` HEAD calls (currently none).

---

### LOW — Acceptable but Worth Noting

#### 9. 150 ms WebRTC stats polling during calls

**File:** `app/browser/tools/speakingIndicator.js:25, 97–100`

Calls `pc.getStats()` for every active `RTCPeerConnection` every 150 ms. This is needed for
real-time speaking detection (mute/speaking/silent states) and has a guard against concurrent
polls.

**Impact:** ~6.7 calls/second during active calls. Acceptable for the use case but could be
relaxed to 200–250 ms without perceptible delay in the speaking indicator overlay.

---

#### 10. System idle polling via recursive IPC

**Files:** `app/browser/notifications/activityManager.js:27`, `app/idle/monitor.js:19–20`

`watchSystemIdleState()` recursively calls itself via `setTimeout`, making an IPC round-trip
to `powerMonitor.getSystemIdleState()` each cycle. The interval is config-driven
(`appIdleTimeoutCheckInterval`, default 10 s).

**Impact:** Low — one IPC call every 10 seconds. The `powerMonitor` API is lightweight. No
action needed unless idle detection is refactored.

---

## Proposed Instrumentation

A lightweight performance metrics module would provide visibility without adding dependencies:

### Startup Metrics

```javascript
// In app/index.js
const appStartTime = performance.now();

app.whenReady().then(() => {
    console.info('[PERF] App ready:', (performance.now() - appStartTime).toFixed(0), 'ms');
});

// In browserWindowManager.js, on 'ready-to-show'
console.info('[PERF] Window ready-to-show:', (performance.now() - appStartTime).toFixed(0), 'ms');

// In preload.js or page load handler
window.addEventListener('load', () => {
    console.info('[PERF] Teams page loaded:', performance.now().toFixed(0), 'ms');
});
```

### Memory Metrics (periodic, main process)

```javascript
setInterval(() => {
    const mem = process.memoryUsage();
    console.info('[PERF] Memory:', {
        heapUsedMB: (mem.heapUsed / 1048576).toFixed(1),
        rssMB: (mem.rss / 1048576).toFixed(1),
    });
}, 300000); // every 5 minutes
```

### Renderer Metrics (on demand via IPC)

```javascript
// Expose via IPC for on-demand diagnostics
ipcMain.handle('get-perf-metrics', () => ({
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
}));
```

This adds no dependencies and produces structured logs compatible with the existing
`electron-log` infrastructure. Since `electron-log` intercepts `console.*` calls in
production, all `[PERF]`-prefixed messages are automatically written to the log file
(typically `~/.config/teams-for-linux/logs/main.log`). No additional transport
configuration is needed — developers and users can grep for `[PERF]` in the existing
log output to review startup timings and memory trends.

## Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | Consolidate MutationObservers (items 2, 3) | Medium | High — reduces per-mutation overhead across all page activity |
| 2 | Cache tray icon resources (item 4) | Low | Medium — eliminates redundant canvas/toDataURL work |
| 3 | Replace timestamp polling with observer (item 1) | Low | Medium — removes continuous 1 s timer |
| 4 | Parallelize offline detection (item 8) | Low | Medium — reduces worst-case block from 10 s to ~2 s |
| ~~5~~ | ~~Add retry limits to shortcuts.js (item 5)~~ | ~~Low~~ | ~~Low~~ — **Implemented** |
| 6 | Parallelize cache size calculation (item 6) | Medium | Low — only runs hourly, but blocks event loop |
| 7 | Add startup/memory instrumentation | Low | Diagnostic — enables measuring future improvements |

## Configuration Options Affecting Performance

For reference, these existing config options influence performance:

| Option | Default | Effect |
|--------|---------|--------|
| `disableGpu` | `false` | Disables GPU compositing, hardware acceleration |
| `cacheManagement.maxCacheSizeMB` | `600` | Threshold for automatic cache cleanup |
| `cacheManagement.cacheCheckIntervalMs` | `3600000` | How often cache size is checked (1 hour) |
| `electronCLIFlags` | `[]` | Arbitrary Chromium flags (can tune memory, GPU, rendering) |
| `appIdleTimeout` | `300` | Seconds before setting away status |
| `appIdleTimeoutCheckInterval` | `10` | Seconds between idle state checks |
| `wayland.xwaylandOptimizations` | `false` | GPU under XWayland |

## References

- [Electron Performance Best Practices](https://www.electronjs.org/docs/latest/tutorial/performance)
- [MutationObserver Performance](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver#performance_considerations)
- Cache Manager: `app/cacheManager/index.js`
- Connection Manager: `app/connectionManager/index.js`
- Speaking Indicator: `app/browser/tools/speakingIndicator.js`
- Tray Icon Renderer: `app/browser/tools/trayIconRenderer.js`
- Development Roadmap: `docs-site/docs/development/plan/roadmap.md`

---
id: 026-performance-audit-outcomes
---

# ADR 026: Performance Audit Outcomes

## Status

✅ Accepted

## Context

The system performance research (March 2026, re-verified July 2026) catalogued ten performance-sensitive patterns across renderer-side browser tools, main-process I/O, and network handling, plus a proposal for a lightweight metrics module. Every item now has an outcome, so this ADR records them and the research document is deleted; the investigation remains in git history under `docs-site/docs/development/research/system-performance-research.md`.

## Decision

Each finding is closed as fixed, fixed differently, or not planned with a recorded reason. Accepted residual costs carry a stated magnitude so a future report can be triaged against them.

| # | Finding | Outcome | Notes |
|---|---------|---------|-------|
| 1 | `timestampCopyOverride` polled every second, indefinitely | Fixed ([#2837](https://github.com/IsmaelMartinez/teams-for-linux/pull/2837)) | Bounded to 120 consecutive one-second attempts, with errors charged to the same budget |
| 2 | Two full-subtree MutationObservers on `document.body` | Not planned | See rationale below |
| 3 | Full button scan on every mutation in `injectedScreenSharing` | Fixed differently | A fast path of CSS, `data-tid` and aria selectors runs first; the full sweep fires only when the fast path finds nothing. Residual cost: one full `document.querySelectorAll("button")` sweep per mutation whenever the fast-path selectors match nothing, which is persistently the case on non-English locales |
| 4 | Tray icon canvas and dataURL re-creation per update | Fixed ([#2837](https://github.com/IsmaelMartinez/teams-for-linux/pull/2837)) | The base-icon `toDataURL()` result is cached. The resize path deliberately remains, costing two canvas creations plus `getContext("2d")` plus a `toDataURL()` per tray update |
| 5 | `shortcuts.js` ready-polling had no retry limit | Fixed | `MAX_READY_RETRIES = 30` caps both ready loops |
| 6 | Sequential recursive directory walk in `cacheManager` | Fixed ([#2837](https://github.com/IsmaelMartinez/teams-for-linux/pull/2837)) | `readdir` with `withFileTypes` dirents, processed in sequential chunks of 32 with `allSettled` isolation per entry. The chunk bounds concurrency per directory, not across the recursion, so the worst case is exponential in tree depth. Accepted because Chromium cache trees are wide and shallow, which keeps in-flight operations near the chunk size; a shared semaphore is the pre-scoped lever if this ever runs over a deep tree |
| 7 | Listeners never removed on window close | Not planned | `app.quit()` follows window close immediately, so cleanup is moot, and multiple windows was rejected in ADR-010. Revisit only if crash-recovery window recreation is ever built |
| 8 | Offline detection probes could block indefinitely | Fixed differently | See rationale below |
| 9 | 150 ms WebRTC stats polling in `speakingIndicator` | Not planned | Roughly 6.7 `getStats()` calls per second per peer connection during calls. Acceptable at 150 ms; relaxing to 200 to 250 ms would add no perceptible delay and is the pre-scoped lever if a CPU-during-calls report lands |
| 10 | Recursive idle-state IPC in `activityManager` | Not planned | One lightweight IPC call per configured interval (default 10 s), acceptable by design |

### Offline detection: a timeout budget that never declares offline (item 8)

The research claimed a 10 second worst case; the git history shows worse. Before [PR #2635](https://github.com/IsmaelMartinez/teams-for-linux/pull/2635) the probes carried no timeouts, so a hung socket never settled and the check could block indefinitely, the symptom reported in [#2611](https://github.com/IsmaelMartinez/teams-for-linux/issues/2611). #2635 added a per-probe `PROBE_TIMEOUT_MS` of 5000 ms, bounding the sequential sweep at roughly 85 seconds. [PR #2816](https://github.com/IsmaelMartinez/teams-for-linux/pull/2816) added an overall `ONLINE_CHECK_BUDGET_MS` of 20000 ms in `app/connectionManager/index.js`, checked before each probe; on exhaustion the sweep stops and assumes online rather than declaring offline. The research's `Promise.any()` recommendation, racing the strategies in parallel, was not adopted: the budget bounds the worst case without firing redundant requests on every check.

### MutationObservers: consolidation rejected, cheaper levers reserved (item 2)

Both observers still watch `document.body` with different mitigations: `mqttStatusMonitor` debounces its callback (300 ms) and filters attribute changes, while `injectedScreenSharing` filters attributes and has the item 3 fast path but no debounce. Neither touches the dominant cost, `childList` plus `subtree` firing both callbacks on every node insertion or removal in a mutation-heavy React page. Of the research's three recommendations, consolidation into a shared dispatcher is rejected: a cross-subsystem refactor of two fragile, unrelated observers tracking different parts of a DOM Microsoft changes without notice, with no metrics infrastructure to prove the win justifies the risk. Narrowing each observation scope to the smallest container holding the relevant elements instead of `document.body`, and reducing the redundant periodic polling, are considered and not taken now; they are the cheap, pre-scoped levers if a renderer-overhead report lands. Such a report needs no instrumentation: a user-supplied DevTools profile or a reproducible idle-CPU observation is enough to reopen this item.

### Instrumentation proposals declined

Of the three proposals, the periodic memory logger, a five-minute `process.memoryUsage()` timer, is rejected on standing-cost grounds: a permanent timer for a diagnostic need that has not arisen. One-shot startup marks and an on-demand `get-perf-metrics` IPC handle are declined as unneeded now, though both are nearly free because `electron-log` already captures console output to the log file. The project deliberately has no performance instrumentation; `electron-log` and `chrome://gpu` remain the only runtime observability.

## Consequences

### Positive

Six of the ten findings are fixed, and the rest carry an explicit reason, a stated magnitude where a residual cost is accepted, and a reopen trigger that works without instrumentation. The catalogue no longer lingers as untracked open work.

### Negative

Renderer overhead from the two body-wide observers persists by choice, and without instrumentation a future regression surfaces as a user-supplied profile or CPU observation rather than a metric.

## Related

- ADR-010: Multiple Windows Support, whose rejection makes item 7 moot
- [#2611](https://github.com/IsmaelMartinez/teams-for-linux/issues/2611), [PR #2635](https://github.com/IsmaelMartinez/teams-for-linux/pull/2635) and [PR #2816](https://github.com/IsmaelMartinez/teams-for-linux/pull/2816), the offline detection history behind item 8
- `app/connectionManager/index.js`, `app/browser/tools/shortcuts.js`, `app/browser/tools/trayIconRenderer.js`, `app/browser/tools/timestampCopyOverride.js`, `app/cacheManager/index.js`, `app/screenSharing/injectedScreenSharing.js`, `app/browser/tools/mqttStatusMonitor.js`, `app/browser/tools/speakingIndicator.js`, `app/browser/notifications/activityManager.js`, `app/mainAppWindow/index.js`
- Research history: see git history for `docs-site/docs/development/research/system-performance-research.md`

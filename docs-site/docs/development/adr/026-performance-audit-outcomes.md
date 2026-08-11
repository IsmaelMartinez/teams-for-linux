---
id: 026-performance-audit-outcomes
---

# ADR 026: Performance Audit Outcomes

## Status

✅ Accepted

## Context

The system performance research (March 2026, re-verified July 2026) audited the codebase and catalogued ten performance-sensitive patterns across renderer-side browser tools, main-process I/O, and network handling, plus a proposal for a lightweight metrics module. The research lifecycle says a document closes once its findings have been decided on, with the decisions moving to an ADR and git history preserving the investigation. Every item now has an outcome, so this ADR records them and the research document is deleted. The full investigation remains in git history under `docs-site/docs/development/research/system-performance-research.md`.

## Decision

Each finding is closed as fixed, fixed differently than proposed, or not planned with a recorded reason. Where a residual cost is accepted, its magnitude is stated so a future report can be triaged against it.

| # | Finding | Outcome | Notes |
|---|---------|---------|-------|
| 1 | `timestampCopyOverride` polled every second, indefinitely | Fixed in `perf/renderer-io-cheap-wins` (in review) | Bounded to 120 consecutive one-second attempts, with errors charged to the same budget |
| 2 | Two full-subtree MutationObservers on `document.body` | Not planned | See rationale below |
| 3 | Full button scan on every mutation in `injectedScreenSharing` | Fixed differently | A fast path of CSS, `data-tid` and aria selectors runs first; the full sweep fires only when the fast path finds nothing. Residual cost: one `document.querySelectorAll("button")` sweep per mutation on non-English locales |
| 4 | Tray icon canvas and dataURL re-creation per update | Fixed in `perf/renderer-io-cheap-wins` (in review) | The base-icon `toDataURL()` result is cached. The resize path deliberately remains, costing two canvas creations plus `getContext("2d")` plus a `toDataURL()` per tray update |
| 5 | `shortcuts.js` ready-polling had no retry limit | Fixed | `MAX_READY_RETRIES = 30` caps both ready loops |
| 6 | Sequential recursive directory walk in `cacheManager` | Fixed in `perf/renderer-io-cheap-wins` (in review) | `readdir` with `withFileTypes` dirents, processed in sequential chunks of 32 with `allSettled` isolation per entry |
| 7 | Listeners never removed on window close | Not planned | `app.quit()` follows window close immediately, so cleanup is moot, and multiple windows was rejected in ADR-010. Revisit only if crash-recovery window recreation is ever built |
| 8 | Offline detection probes could block indefinitely | Fixed differently | See rationale below |
| 9 | 150 ms WebRTC stats polling in `speakingIndicator` | Not planned | Roughly 6.7 `getStats()` calls per second per peer connection during calls. Acceptable at 150 ms; relaxing to 200 to 250 ms would add no perceptible delay and is the pre-scoped lever if a CPU-during-calls report lands |
| 10 | Recursive idle-state IPC in `activityManager` | Not planned | One lightweight IPC call per configured interval (default 10 s), acceptable by design |

### Offline detection: a timeout budget that never declares offline (item 8)

The research claimed a 10 second worst case; the git history shows the real progression was worse. Before [PR #2635](https://github.com/IsmaelMartinez/teams-for-linux/pull/2635) the probes carried no timeouts, so a hung socket never settled and the check could block indefinitely, which was the symptom reported in [#2611](https://github.com/IsmaelMartinez/teams-for-linux/issues/2611). #2635 added a per-probe `PROBE_TIMEOUT_MS` of 5000 ms, bounding the sequential sweep at roughly 85 seconds. [PR #2816](https://github.com/IsmaelMartinez/teams-for-linux/pull/2816) then added an overall `ONLINE_CHECK_BUDGET_MS` of 20000 ms in `app/connectionManager/index.js`, checked before each probe starts. When the budget is exhausted the sweep stops and assumes online rather than declaring offline, so a slow network degrades to an optimistic reload instead of a stall. The research's `Promise.any()` recommendation, racing the strategies in parallel, was considered and not adopted: a timeout budget over the existing sequential probes achieves the bounded worst case without firing redundant network requests on every check.

### MutationObservers: consolidation rejected, cheaper levers reserved (item 2)

`mqttStatusMonitor` and `injectedScreenSharing` each still attach a full-subtree observer to `document.body`, with different mitigations: `mqttStatusMonitor` debounces its callback (300 ms) and filters attribute changes, while `injectedScreenSharing` filters attributes and has the item 3 fast path but no debounce. None of that touches the dominant cost, which is `childList` plus `subtree` firing both callbacks on every node insertion or removal in a mutation-heavy React page. The research made three recommendations here. Consolidating both observers into a shared dispatcher is rejected: it is a cross-subsystem refactor of two fragile, unrelated observers that track different parts of a DOM Microsoft changes without notice, and with no metrics infrastructure there is no way to prove the win justifies the risk. The other two, narrowing each observation scope to the smallest container holding the relevant elements instead of `document.body`, and reducing or removing the redundant periodic polling, are considered and not taken now; they are the cheap, pre-scoped levers to reach for first if a renderer-overhead report lands. Such a report needs no in-app instrumentation: a user-supplied DevTools performance profile or a reproducible idle-CPU observation is enough to reopen this item.

### Instrumentation proposals declined

The research proposed three separable pieces of instrumentation. The periodic memory logger, a five-minute `process.memoryUsage()` timer, is rejected on standing-cost grounds: a permanent timer serving a diagnostic need that has not arisen. One-shot startup marks and an on-demand `get-perf-metrics` IPC handle were separately declined as unneeded now; both are nearly free because `electron-log` already captures console output to the log file, so either can be added the day a report requires them. The project deliberately has no performance instrumentation; `electron-log` output and `chrome://gpu` remain the only runtime observability.

## Consequences

### Positive

Items 3, 5 and 8 are fixed in main, and items 1, 4 and 6 have their fixes in review on `perf/renderer-io-cheap-wins`. Every remaining item carries an explicit reason, a stated magnitude where a residual cost is accepted, and a reopen trigger that works without instrumentation. The standing catalogue no longer lingers as untracked open work.

### Negative

Renderer overhead from the two body-wide observers persists by choice, and without instrumentation a future regression surfaces as a user-supplied profile or CPU observation rather than a metric.

## Related

- ADR-010: Multiple Windows Support, whose rejection makes item 7 moot
- [#2611](https://github.com/IsmaelMartinez/teams-for-linux/issues/2611), [PR #2635](https://github.com/IsmaelMartinez/teams-for-linux/pull/2635) and [PR #2816](https://github.com/IsmaelMartinez/teams-for-linux/pull/2816), the offline detection history behind item 8
- `app/connectionManager/index.js`, `app/browser/tools/shortcuts.js`, `app/browser/tools/trayIconRenderer.js`, `app/browser/tools/timestampCopyOverride.js`, `app/cacheManager/index.js`, `app/screenSharing/injectedScreenSharing.js`, `app/browser/tools/mqttStatusMonitor.js`, `app/browser/tools/speakingIndicator.js`, `app/browser/notifications/activityManager.js`, `app/mainAppWindow/index.js`
- Research history: see git history for `docs-site/docs/development/research/system-performance-research.md`

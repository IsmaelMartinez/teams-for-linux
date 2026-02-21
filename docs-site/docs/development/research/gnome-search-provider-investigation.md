# GNOME Shell Search Provider Investigation

:::warning Not Recommended
Feasible but latency too high (~300-1100ms) for acceptable UX. Not planned for implementation.
:::

> **Issue:** [#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075) | **Status:** Not Recommended

## Summary

**Request:** Search Teams files directly from GNOME Shell overview.

**Verdict:** Feasible if Teams is running, but latency will be poor (~1-2s per search). Recommend against implementation due to unfavorable complexity-to-value ratio.

## GNOME Search Provider Requirements

Must implement `org.gnome.Shell.SearchProvider2` D-Bus interface:

- `GetInitialResultSet(terms)` - Return result IDs (expected < 500ms)
- `GetSubsearchResultSet(prev, terms)` - Refine as user types
- `GetResultMetas(ids)` - Return name, icon, description
- `ActivateResult(id)` - Open the selected result

Requires system files in `/usr/share/dbus-1/services/` and `/usr/share/gnome-shell/search-providers/`.

## Critical Challenges

| Challenge | Severity | Notes |
|-----------|----------|-------|
| Authentication without UI | High | Tokens are acquired via Teams' React internals, requiring an active BrowserWindow. A background service cannot do this. |
| Latency | High | Graph API: 200-1000ms per call. GNOME expects ~500ms total |
| Package distribution | Medium | AppImage/Flatpak/Snap can't easily install system D-Bus files |
| GNOME-only | Low | Acceptable trade-off |

## Communication Options

### Option 1: MQTT (Recommended if proceeding)

Use existing MQTT infrastructure - search provider publishes query, Teams responds.

- **Latency:** ~100-200ms overhead + Graph API time
- **Complexity:** Low (reuses existing code)
- **Pros:** Works in Flatpak/Snap sandboxes (TCP-based), already implemented
- **Cons:** Requires MQTT broker running

### Option 2: IPC (Unix socket)

Search provider talks directly to running Electron process via Unix socket.

- **Latency:** ~50ms overhead + Graph API time
- **Complexity:** Medium
- **Cons:** Doesn't work in Flatpak/Snap sandboxes (socket access restricted)

### Option 3: Launch-only Provider

Just launch Teams with search query pre-filled. No results in GNOME Shell.

- **Latency:** N/A (just opens app)
- **Complexity:** Very low
- **Cons:** Does not show results directly in GNOME Shell, failing to meet the core user request

## Why Latency is Unavoidable

Total round trip time breakdown:

```
User types → D-Bus → MQTT → Teams → Graph API → Microsoft servers → back
             ~10ms   ~100ms         ←——— 200-1000ms round trip ———→
```

Total: **~300-1100ms** for the complete search. Graph API latency dominates and can't be avoided. Caching doesn't help for arbitrary search queries.

## Recommendation

**Do not implement.** High development effort for a feature limited to GNOME users, combined with poor UX (slow results), results in an unfavorable complexity-to-value ratio.

**Alternatives:**
- Global keyboard shortcut to focus Teams + open search (already works)
- CLI wrapper around Graph API with cached credentials (could integrate with launchers like `rofi`)

## If Proceeding Anyway

1. Use MQTT approach (works in sandboxed environments)
2. Document that Teams + MQTT broker must be running
3. Limit to file search only (clearest use case)
4. Show "Searching..." placeholder immediately

## References

- [GNOME Search Provider Tutorial](https://developer.gnome.org/documentation/tutorials/search-provider.html)
- [dbus-native](https://github.com/sidorares/dbus-native) - Already used in project for Intune
- [Microsoft Graph Search API](https://learn.microsoft.com/en-us/graph/search-concept-overview)

# Electron-Store Upgrade Research

**Date:** 2026-02-04
**Scope:** Upgrade electron-store from 8.2.0 to 11.0.2, or replace it
**Status:** Implemented (2026-02-04)

## Current Usage Analysis

### Dependency

- **Package:** `electron-store@8.2.0`
- **Only import:** `app/appConfiguration/index.js` (line 1)

### Store Instances

Two `Store` instances are created in `AppConfiguration`:

| Instance | File Name | Purpose |
|----------|-----------|---------|
| `legacyConfigStore` | `config.json` | Menu-toggleable notification settings, spell checker languages |
| `settingsStore` | `settings.json` | Partition zoom levels |

### API Surface Used

Only **three methods** are used across the entire codebase:

| Method | Locations |
|--------|-----------|
| `.get(key)` | `app/index.js`, `app/partitions/manager.js` |
| `.set(key, value)` | `app/menus/index.js`, `app/mainAppWindow/index.js`, `app/partitions/manager.js` |
| `.has(key)` | `app/index.js` |

### Features NOT Used

- Schema validation
- Encryption (`encryptionKey`)
- File watching (`onDidChange`)
- Default values
- `delete()`, `clear()`, `reset()`

### Constructor Options

```javascript
new Store({
  name: "config",        // file name
  clearInvalidConfig: true  // auto-clear corrupted data
})
```

## Breaking Changes: v8.2.0 to v11.0.2

### v9.0.0 (May 2024) - Major Breaking Change

- **ESM-only**: `require('electron-store')` no longer works with standard CJS resolution
- **Node.js 20+ required**
- **Electron 30+ required**

### v10.0.0 (June 2024)

- JSON Schema draft-v7 replaced with draft-2020-12
- **No impact**: This project does not use the `schema` option

### v11.0.0 (September 2024)

- Updated `conf` dependency to v15.0.0
- No known breaking API changes
- New method: `.appendToArray(key, value)`

### Impact Summary

| Concern | Impact | Notes |
|---------|--------|-------|
| ESM-only (v9+) | **Solvable** | Node.js 22 `require(esm)` works (see below) |
| Node.js 20+ required | None | Electron 39 bundles Node.js 22.22.0 |
| Electron 30+ required | None | Project uses Electron ^39.4.0 |
| Schema draft change | None | No `schema` option used |
| API changes | None | `.get()`, `.set()`, `.has()` all unchanged |
| `clearInvalidConfig` | None | Still supported |

## Key Finding: `require(esm)` Works on Node.js 22

Node.js 22 ships with stable support for `require()` of ESM-only packages. The project's Electron 39 bundles Node.js 22.22.0.

**Verified experimentally** - installing electron-store@11.0.2 and running:

```javascript
const { default: Store } = require("electron-store");
// Store is [class ElectronStore extends Conf] - works correctly
```

The only code change needed is extracting the default export:

```javascript
// Before (v8.2.0 - CJS):
const Store = require("electron-store");

// After (v11.0.2 - ESM via require):
const { default: Store } = require("electron-store");
```

This is a **one-line change** in `app/appConfiguration/index.js`.

## Alternatives Considered

### 1. electron-conf (CJS + ESM compatible)

- **Pros:** Drop-in replacement, CJS support, actively maintained, schema validation
- **Cons:** No encryption, smaller community
- **Verdict:** Viable but unnecessary given `require(esm)` works

### 2. Custom JSON file store (zero dependencies)

- **Pros:** Zero external dependencies, full control, trivial to implement (~30 lines)
- **Cons:** Must handle edge cases (atomic writes, corruption recovery, dot-notation keys)
- **Verdict:** Viable given the minimal API surface used, but adds maintenance burden for minimal gain

### 3. Electron safeStorage + fs

- **Pros:** Built into Electron, OS-level encryption
- **Cons:** Only provides encryption primitives, must build storage layer
- **Verdict:** Better suited for sensitive credentials, not general config

### 4. Full ESM migration then upgrade

- **Pros:** Modernizes the entire codebase
- **Cons:** Touches 55+ files using `require()`, high risk, large scope
- **Verdict:** Unnecessary for this upgrade; can be done independently later

### 5. Stay on v8.2.0

- **Pros:** Zero effort
- **Cons:** Increasingly outdated, won't receive security fixes
- **Verdict:** Not recommended long-term

## Recommendation

**Upgrade electron-store to 11.0.2 with a one-line code change.**

The `require(esm)` support in Node.js 22 (bundled with Electron 39) eliminates the ESM migration barrier entirely. The upgrade requires:

1. Update `package.json`: `"electron-store": "8.2.0"` -> `"11.0.2"`
2. Change one line in `app/appConfiguration/index.js`:

```javascript
// From:
const Store = require("electron-store");
// To:
const { default: Store } = require("electron-store");
```

3. Run `npm run lint` and `npm run test:e2e` to verify

No other code changes are needed. All used API methods (`.get()`, `.set()`, `.has()`) and constructor options (`name`, `clearInvalidConfig`) remain unchanged.

### Why Not Replace It?

Despite the minimal usage, electron-store still provides value over a custom solution:

- **Atomic writes**: Prevents data corruption on crash
- **File corruption recovery**: `clearInvalidConfig` handles corrupted JSON gracefully
- **Dot-notation key paths**: `settingsStore.get("app.partitions")` works on nested objects
- **Cross-platform paths**: Automatically uses `app.getPath('userData')`
- **Tested and maintained**: Battle-tested by a large user base

Building a custom replacement would need to reimplement these features, adding maintenance cost for no functional benefit.

### Future Considerations

- If the project migrates to ESM in the future, change the import to `import Store from 'electron-store'`
- The `require(esm)` approach is a stable bridge that avoids a project-wide CJS-to-ESM migration
- Monitor `electron-store` maintenance status; if it becomes unmaintained, `electron-conf` is the closest drop-in replacement

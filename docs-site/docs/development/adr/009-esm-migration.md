---
id: 009-esm-migration
---

# ADR 009: Migrate Codebase from CommonJS to ES Modules

## Status

Implemented (PR #2023)

## Context

### Problem

The Teams for Linux codebase used CommonJS (`require`/`module.exports`) for all module imports. This became problematic because:

1. **Dependency Compatibility**: Modern npm packages are increasingly ESM-only:
   - `yargs` v18+ is ESM-only
   - `electron-store` v9+ is ESM-only
   - Many other dependencies are dropping CommonJS support

2. **Future-Proofing**: Node.js and the JavaScript ecosystem are moving toward ESM as the standard module system

3. **Tooling Benefits**: ESM enables:
   - Better static analysis
   - Improved tree-shaking for bundle optimization
   - Native browser module compatibility

### Constraints

- **Electron Compatibility**: Electron 39+ fully supports ESM
- **Renderer Process Limitations**: Some Electron APIs (e.g., `safeStorage`) only work in the main process
- **Backward Compatibility**: Must preserve all existing functionality
- **Security**: Must maintain or improve security posture (CSP, sandbox, etc.)

### Investigation

We evaluated:
1. Incremental migration (file-by-file) - rejected due to CJS/ESM interop complexity
2. Full migration in one PR - chosen for consistency and avoiding mixed module systems
3. Waiting for dependency fixes - rejected as dependencies are moving away from CJS

---

## Decision

**Migrate the entire codebase from CommonJS to ES Modules in a single, comprehensive PR.**

### Implementation Strategy

1. **Update package.json**: Add `"type": "module"`

2. **Convert all imports/exports**:
   - `require()` → `import`
   - `module.exports` → `export default` or `export { }`
   - `__dirname`/`__filename` → Custom utility using `import.meta.url`

3. **Create ESM utilities** (`app/utils/esm-utils.js`):
   ```javascript
   import { fileURLToPath } from 'node:url';
   import path from 'node:path';

   export function getDirname(importMetaUrl) {
     return path.dirname(fileURLToPath(importMetaUrl));
   }

   export function getFilename(importMetaUrl) {
     return fileURLToPath(importMetaUrl);
   }
   ```

4. **Update file extensions**: Add `.js` to all local imports (required for ESM)

5. **Preserve security controls**:
   - Content Security Policy (CSP) in browserWindowManager
   - `sandbox: true` for auxiliary windows
   - IPC channel allowlisting

### Key Decisions Made During Migration

| Issue | Decision | Rationale |
|-------|----------|-----------|
| `safeStorage` in renderer | Remove from tokenCache.js | API only available in main process |
| WeakMap private fields | Keep as-is | Works correctly in ESM |
| Dynamic requires | Convert to dynamic imports | `await import()` syntax |
| Build scripts | Convert to ESM | Consistency |

---

## Consequences

### Positive

- ✅ **Dependency Updates**: Can now use latest versions of yargs (v18), electron-store (v11), and other ESM-only packages
- ✅ **Modern JavaScript**: Codebase uses standard module syntax
- ✅ **Better Tooling**: Improved IDE support, static analysis, and potential tree-shaking
- ✅ **Future-Proof**: Aligned with JavaScript ecosystem direction
- ✅ **No Breaking Changes**: All user-facing functionality preserved

### Negative

- ⚠️ **tokenCache.js Simplification**: Removed `safeStorage` integration (was never functional in renderer context anyway)
- ⚠️ **Verbose Imports**: Must include `.js` extensions in all local imports
- ⚠️ **No __dirname**: Requires utility function for file paths

### Neutral

- All 47 JS files in `/app` converted
- Build scripts (`/scripts`) converted
- No changes to HTML/CSS/assets
- Test files updated to ESM

---

## Files Changed

### Scope

| Category | Files | Notes |
|----------|-------|-------|
| Browser tools | 15 | activityHub, zoom, shortcuts, etc. |
| Main process | 18 | config, menus, notifications, etc. |
| Screen sharing | 6 | service, preload, injected scripts |
| Build scripts | 4 | afterpack, generateReleaseInfo, etc. |
| Utilities | 1 | New esm-utils.js |
| Other | 3 | preload, helpers |

### Critical Restorations

During migration, AI-assisted refactoring inadvertently simplified some modules. These were restored to full functionality:

- `connectionManager/index.js` - Network resilience logic
- `activityHub.js` - Teams React component integration
- `browserWindowManager.js` - CSP, call handlers, screen sharing
- `spellCheckProvider/codes.js` - Full language code list (175+ languages)
- `menus/appMenu.js` - Complete menu structure with accelerators
- `partitions/manager.js` - Array-based partition storage

---

## Verification

### Automated Checks

- ✅ ESLint passes (0 errors)
- ✅ Build passes (all platforms: Linux x64/arm64/armv7l, macOS, Windows)
- ✅ E2E tests pass
- ✅ SonarCloud Quality Gate passed
- ✅ Snyk security scan passed

### Manual Verification

- Line count comparison: +89 lines overall (+0.9%)
- Only intentional reduction: tokenCache.js (-31% due to safeStorage removal)
- All functions/methods verified present

---

## Alternatives Considered

### Option 1: Stay on CommonJS

- **Pros**: No migration effort, no risk of regressions
- **Cons**: Stuck on old dependency versions, increasing technical debt
- **Why rejected**: Unsustainable as ecosystem moves to ESM

### Option 2: Incremental Migration

- **Pros**: Lower risk per change, easier to review
- **Cons**: CJS/ESM interop is complex and buggy, mixed codebase harder to maintain
- **Why rejected**: Full migration is cleaner and avoids interop issues

### Option 3: Use Build Tool (esbuild/rollup) for Transpilation

- **Pros**: Could keep CJS source, output ESM
- **Cons**: Added build complexity, source maps, debugging difficulty
- **Why rejected**: Native ESM is simpler and Electron supports it directly

---

## Related

- PR #2023: Implementation PR
- [yargs v18 Migration Guide](https://github.com/yargs/yargs/blob/main/docs/migration-guide.md)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [Electron ESM Support](https://www.electronjs.org/docs/latest/tutorial/esm)

---

## Implementation Notes

### For Contributors

When adding new files:

```javascript
// Use import instead of require
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { getDirname } from '../utils/esm-utils.js';

const __dirname = getDirname(import.meta.url);

// Use export instead of module.exports
export default MyClass;
export { helperFunction };
```

### Common Patterns

```javascript
// Dynamic import (replaces dynamic require)
const module = await import('./path/to/module.js');

// JSON import
import config from './config.json' with { type: 'json' };

// __dirname equivalent
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

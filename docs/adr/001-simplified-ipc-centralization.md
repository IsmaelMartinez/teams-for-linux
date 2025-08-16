# ADR-001: Simplified IPC Centralization Approach

**Date**: 2025-08-16  
**Status**: Accepted  
**Context**: IPC Event Centralization Implementation  

## Decision

We have decided to implement a **simplified IPC centralization approach** rather than using complex type-safe libraries or extensive code generation.

## Context

During the research phase (Task 1.1), we evaluated various approaches for centralizing IPC events in Teams for Linux:

1. **Complex type-safe libraries** (e.g., `interprocess` by daltonmenezes)
2. **AsyncAPI with full code generation**
3. **Simplified approach with AsyncAPI for documentation only**

## Analysis

### Type-Safe IPC Libraries
- **Security Risk**: Most libraries require `sandbox: false` in BrowserWindow configuration
- **Maintenance Risk**: Many libraries are undermaintained or have limited community support
- **Unnecessary Complexity**: Project is pure JavaScript, type safety provides limited value

### Full AsyncAPI Code Generation
- **Over-engineering**: Extensive TypeScript code generation not needed for JavaScript project
- **Complexity**: Additional build steps and dependencies
- **Mismatch**: Templates designed for server applications, not Electron IPC

### Simplified Approach ✅
- **Security**: No need to disable Electron sandbox
- **Maintainability**: Uses existing JavaScript patterns familiar to the team
- **Documentation**: AsyncAPI provides excellent API documentation
- **Minimal Dependencies**: Only development-time documentation tools

## Decision Details

### What We're Using:
1. **AsyncAPI for documentation only** - Generate comprehensive HTML docs
2. **Existing JavaScript IPC patterns** - Keep `ipcMain.handle`/`ipcMain.on` patterns
3. **Simple organization** - Module-based handler organization
4. **Optional validation** - AJV for critical events only

### What We're NOT Using:
1. Complex type-safe IPC libraries
2. TypeScript code generation from AsyncAPI
3. External runtime dependencies
4. Sandbox-disabling solutions

### Dependencies Added:
```json
{
  "devDependencies": {
    "@asyncapi/cli": "^3.2.0",
    "@asyncapi/generator": "^2.7.1",
    "@asyncapi/html-template": "^3.3.1"
  }
}
```

## Consequences

### Positive:
- **Security**: Maintains Electron sandbox protection
- **Simplicity**: Easy to understand and maintain
- **Documentation**: Auto-generated API documentation from schema
- **Performance**: No runtime overhead from type checking libraries
- **Compatibility**: No breaking changes to existing renderer processes

### Negative:
- **No Compile-time Type Safety**: Manual validation required (acceptable for JavaScript project)
- **Documentation Maintenance**: AsyncAPI schema needs manual updates (but generates docs automatically)

## Implementation Notes

1. **AsyncAPI Schema**: Documents existing IPC patterns in `docs/asyncapi/teams-for-linux-ipc.yaml`
2. **Documentation Generation**: Custom script at `scripts/generate-asyncapi-docs.js`
3. **Validation**: Optional AJV validation for critical events only
4. **Organization**: Simple handler modules following existing project patterns

## Alternatives Considered

### `interprocess` library
- **Rejected**: Requires `sandbox: false` (security risk)
- **Rejected**: Unmaintained (last release over a year ago)

### Full TypeScript Migration
- **Rejected**: Would require massive project restructuring
- **Rejected**: Type safety benefits minimal for IPC communication

### Custom Type-Safe Solution
- **Rejected**: Would be reinventing the wheel
- **Rejected**: Maintenance burden for the team

## Review

This decision should be reviewed if:
1. Project migrates to TypeScript
2. Security requirements change regarding sandbox usage
3. AsyncAPI toolchain becomes incompatible
4. Performance issues arise with current IPC patterns

---

**References:**
- Research document: `docs/research/asyncapi-electron-ipc-research.md`
- Task list: `tasks/tasks-prd-ipc-centralization.md`
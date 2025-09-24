# ADR-002: Token Refresh Implementation Strategy

**Status**: Accepted  
**Date**: 2025-09-22  
**Authors**: Development Team  
**Related**: ADR-001 (Token Cache Secure Storage Implementation)

## Context

Following the successful implementation of secure token cache storage (ADR-001), we needed to develop a mechanism for proactive token refresh to prevent authentication interruptions. Through proof-of-concept development, we identified the working parameters and implementation approach for forcing Microsoft Teams authentication token refresh.

## Problem

Microsoft Teams tokens have a 24-hour lifespan and are typically refreshed by the native Teams web application approximately 1 hour before expiry. However, for a desktop wrapper application like Teams for Linux, we need the ability to:

1. **Proactively refresh tokens** at configurable intervals (not just before expiry)
2. **Force fresh token retrieval** (bypass cached tokens when needed)
3. **Integrate with secure storage** from ADR-001 implementation
4. **Avoid authentication interruptions** during extended usage sessions

## Investigation Findings

### Working Token Refresh Parameters

Through systematic testing, we identified the **minimal required parameters** for forcing Microsoft Teams token refresh:

```javascript
{
  correlation: correlation,        // Required - Teams correlation object
  forceRenew: true,               // Force new token request
  forceRefresh: true,             // Override cache behavior  
  skipCache: true,                // Bypass token cache
  prompt: 'none'                  // Silent refresh (no user interaction)
}
```

### Key Technical Discoveries

1. **Correlation Requirement**: The `correlation` parameter from Teams core services is **mandatory** for forced refresh. Without it, requests fail with "Cannot read properties of undefined (reading 'scenarioName')" error.

2. **Multiple Force Parameters Needed**: Single parameters like `forceRenew: true` alone are insufficient. The combination of `forceRenew`, `forceRefresh`, and `skipCache` is required for reliable cache bypassing.

3. **Silent Operation**: Using `prompt: 'none'` ensures refresh operations don't interrupt user workflow with authentication dialogs.

4. **Reliable Success Indicator**: Successful forced refresh returns `fromCache: false` in the result object, confirming fresh token retrieval.

### Timer Implementation Strategy

**Decision**: Use `setInterval` for refresh scheduling
- **Rationale**: Simple, reliable, and sufficient for our needs
- **Alternative Considered**: `setTimeout` with recursive calls - unnecessary complexity
- **Alternative Considered**: Advanced scheduling systems - over-engineering for this use case

### Security Considerations

**Refresh Frequency Considerations:**

- **Frequent Refresh** (1 hour default): More proactive, prevents authentication interruptions
- **Less Frequent** (4-6 hours): Reduces API calls, closer to native Teams behavior  
- **User Choice**: Configurable interval allows users to balance security vs. resource usage
- **Mitigation**: Risk is acceptable due to secure storage implementation (ADR-001) using Electron safeStorage API

**Validation Bounds:**
- **Minimum**: 1 hour (prevent Microsoft API spam)
- **Maximum**: 24 hours (prevent token expiry)
- **Default**: 1 hour proactive strategy (balances security with usability)

## Decision

### Core Implementation Approach

1. **Use proven refresh parameters** documented above for all token refresh operations
2. **Implement `setInterval`-based scheduling** for refresh timing
3. **Integrate with TeamsTokenCache class** from ADR-001 (extend, don't replace)
4. **Default to enabled with 1-hour interval** - simple, effective configuration

### Configuration Design

```javascript
{
  tokenRefresh: {
    enabled: true,                   // true/false to enable/disable feature
    refreshIntervalHours: 1          // 1-24 hour range
  }
}
```

### MS Teams Native Refresh Handling

**Research Required**: Determine whether to:
- **Option A**: Override native Teams refresh calls (preferred if simple)
- **Option B**: Run alongside native refresh (acceptable fallback)

This decision point requires additional investigation in the implementation phase.

## Implementation Constraints

### Must Follow Existing Patterns

1. **WeakMap Pattern**: Use for private fields in AppConfiguration class
2. **[TOKEN_CACHE] Logging**: Maintain consistent logging prefix
3. **Secure Storage Integration**: Leverage existing safeStorage → localStorage → memory fallback
4. **Configuration Management**: Use existing AppConfiguration and electron-store patterns

### Development Guidelines

1. **No Runtime Configuration Changes**: App restart required for refresh setting changes
2. **No Fallback Implementation**: Teams handles authentication failures naturally
3. **Documentation-Focused**: Use docs-site instead of JSDoc
4. **Production Logging Only**: Convert debug logging to appropriate log levels

## Consequences

### Positive

- **Reliable Token Refresh**: Proven working implementation reduces authentication interruptions
- **User Configurable**: Allows users to customize refresh frequency based on usage patterns
- **Secure**: Integrates with existing secure token storage without compromising security
- **Simple**: Uses straightforward `setInterval` approach for maintainable code

### Negative

- **Additional Complexity**: Adds refresh scheduling logic to token cache system
- **Resource Usage**: Timer-based refresh consumes minimal system resources
- **Configuration Dependency**: Users must restart application to change refresh settings

### Neutral

- **API Usage**: Proactive refresh increases Microsoft API calls (within reasonable limits)
- **Dual Refresh Potential**: May run alongside native Teams refresh until override investigation completed

## Implementation Tasks

This ADR establishes the foundation for tasks 3.0-6.0 in `tasks-prd-configurable-token-refresh.md`:

1. Extract proven refresh mechanism from POC implementation
2. Integrate refresh scheduling with TeamsTokenCache class
3. Add configuration system with validation (1-24 hour bounds)
4. Clean up debug code and implement production logging
5. Update documentation and architecture guides

## Monitoring and Success Criteria

- **Success Indicator**: `fromCache: false` in refresh responses
- **Error Indicator**: Empty error objects or correlation-related failures
- **Performance**: Refresh operations complete within 2-3 seconds
- **Logging**: Clear `[TOKEN_CACHE]` prefixed logs for refresh activities

---

**References:**
- ADR-001: Token Cache Secure Storage Implementation  
- POC Implementation: `app/browser/tools/reactHandler.js` (triggerTokenRefresh method)
- Configuration Patterns: `app/appConfiguration/index.js`
- Task List: `tasks/tasks-prd-configurable-token-refresh.md`
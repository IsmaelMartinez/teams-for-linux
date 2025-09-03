# localStorage Token Patterns Analysis

## Task 1.2: localStorage Token Key Patterns and Data Structures

**Date**: September 2, 2025  
**Status**: ✅ Complete  
**Teams Version**: v2 (React 16-17, legacy fiber)

## Summary

Analysis of Teams localStorage reveals **62 authentication-related keys** organized into distinct patterns with consistent prefixes and structures. This data forms the foundation for implementing the token cache bridge.

## Token Categories Breakdown

### Auth Keys (31 total)
**Pattern**: `tmp.auth.v1.{UUID | GLOBAL}.{resource}.{token_type}`

**Structure**:
- All prefixed with `tmp.auth.v1.`
- Two key types:
  - UUID-based: `tmp.auth.v1.d3578ae8-0d6d-44c0-8d1f-297336ecb0a2.{resource}`
  - Global: `tmp.auth.v1.GLOBAL.{resource}`

**Examples**:
- `tmp.auth.v1.d3578ae8-0d6d-44c0-8d1f-297336ecb0a2.microsoft.com.accessToken`
- `tmp.auth.v1.GLOBAL.EncryptionKey`
- `tmp.auth.v1.GLOBAL.LogoutState`
- `tmp.auth.v1.GLOBAL.authSessionId`

### Refresh Keys (1 total)
**Pattern**: `{UUID}.{resource}.refresh_token`

**Structure**: 
- Direct UUID prefix
- Example: `d3578ae8-0d6d-44c0-8d1f-297336ecb0a2.login.microsoftonline.com.refresh_token.4.k...`
- Length: 145 characters
- Contains: 4 dot-separated parts, 20 dash-separated parts

### User Keys (22 total)  
**Pattern**: `{UUID}.{resource}.{user_data} | tmp.auth.v1.{GLOBAL | UUID}.{user_context}`

**Two sub-patterns**:

1. **Direct UUID User Data** (18 keys):
   - `d3578ae8-0d6d-44c0-8d1f-297336ecb0a2.login.microsoftonline.com.idtoken.{claims}`
   - Very large keys (up to 1,477 characters)
   - Contains extensive user profile and claim data

2. **Global User Data** (4 keys):
   - `tmp.auth.v1.GLOBAL.User.User`
   - `tmp.auth.v1.GLOBAL.PrimaryUser`
   - `tmp.auth.v1.d3578ae8-0d6d-44c0-8d1f-297336ecb0a2.User`

### Other Token-Related Keys (8 total)
**Pattern**: Mixed patterns including MSAL

**Notable entries**:
- `msal.token.keys.5e3ce6c0-2b1f-4627-bb78-5aa95ef9cada` (Microsoft Authentication Library)
- Various UUID-prefixed resource keys
- Session and temporary tokens

## Key Structure Analysis

### Common Prefixes
- **`tmp`**: 37 keys (59.7%) - Temporary auth storage
- **`d3578ae8-0d6d-44c0-8d1f-297336ecb0a2`**: 24 keys (38.7%) - User-specific UUID
- **`msal`**: 1 key (1.6%) - Microsoft Authentication Library

### Structural Patterns

1. **Dot-separated hierarchical structure** (2-90 parts)
2. **UUID format**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
3. **Version prefix**: `v1` indicates API version
4. **Resource domains**: `microsoft.com`, `login.microsoftonline.com`
5. **Token types**: `accessToken`, `refresh_token`, `idtoken`

## Key Insights for Token Cache Implementation

### 1. Hierarchical Organization
Teams uses a hierarchical dot-notation system that can be easily parsed:
```javascript
const [prefix, type, version, identifier, ...resource] = key.split('.');
```

### 2. UUID-Based User Context
All user-specific tokens are prefixed with the same UUID (`d3578ae8-0d6d-44c0-8d1f-297336ecb0a2`), making user-specific token retrieval straightforward.

### 3. Consistent Versioning
The `v1` version indicator suggests a versioned API that the cache bridge must respect.

### 4. Mixed Storage Strategy
Teams uses both temporary (`tmp.`) and direct UUID prefixes, indicating different token lifecycles.

## Implementation Recommendations

### Token Cache Bridge Interface

Based on these patterns, the cache bridge should support:

```javascript
const tokenCache = {
  // Direct localStorage access
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
  
  // Pattern-based helpers
  getUserTokens: (uuid) => {
    // Get all tokens for specific UUID
  },
  getGlobalTokens: () => {
    // Get all tmp.auth.v1.GLOBAL.* tokens
  },
  getRefreshTokens: () => {
    // Get all refresh_token keys
  }
};
```

### Key Filtering Strategy

For the cache bridge, focus on these key patterns:
1. `tmp.auth.v1.*` - All auth v1 tokens
2. `{UUID}.*.refresh_token.*` - Refresh tokens
3. `msal.token.*` - MSAL tokens
4. `{UUID}.login.microsoftonline.com.*` - Microsoft login tokens

## Security Considerations

- **No PII logged**: All analysis uses key patterns only, no values
- **UUID anonymization**: Production logs should truncate UUIDs
- **Key length variations**: Large keys (up to 1,477 chars) indicate rich token data

## Next Steps

- ✅ **Task 1.2 Complete**: localStorage patterns documented
- ⏳ **Task 1.3**: Research MSAL token cache interface patterns  
- ⏳ **Task 2.1**: Implement tokenCache.js with these patterns

## Token Statistics

- **Total auth-related keys**: 62
- **Auth keys**: 31 (50.0%)
- **User keys**: 22 (35.5%) 
- **Refresh keys**: 1 (1.6%)
- **Other keys**: 8 (12.9%)
- **Average key length**: 284 characters
- **Longest key**: 1,477 characters
- **Shortest key**: 28 characters

---

*Analysis completed as part of Task 1.2 in PRD token-cache-authentication-fix implementation.*
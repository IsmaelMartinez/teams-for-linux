# Plugin Manifest Validation System

## Overview

Enhanced the PluginManager with comprehensive manifest validation while maintaining backward compatibility with existing tests.

## Implementation

### 1. Enhanced PluginManager Validation

**File:** `/app/core/PluginManager.js`

Enhanced `_validateManifest()` method to validate:

#### Required Fields (Backward Compatible)
- `name` - Plugin name (required)
- `version` - Semantic version (required, format: X.Y.Z)

#### Optional Fields (Validated When Present)

**Plugin Identity:**
- `id` - Unique identifier (e.g., "core.notifications")
  - Format: alphanumeric, dots, hyphens, underscores
  - Example: "core.notifications", "plugin-name"

**Plugin Information:**
- `description` - Plugin description (max 500 characters)
- `author` - Plugin author name
- `license` - License type (e.g., "MIT")
- `repository` - Repository URL or object with `url` field

**Permissions Array:**
- Format: "namespace:action" or single-word
- Examples: "events:emit", "config:read", "logging"
- Special: "*" wildcard for all permissions
- Validation: Alphanumeric, hyphens, underscores only

**Dependencies Array:**
- List of plugin IDs this plugin depends on
- Must be non-empty strings
- Example: ["core.auth", "core.storage"]

**Entry Points:**
- `main` - Main process entry point
- `preload` - Preload script for renderer
- `renderer` - Renderer process entry point
- Requirements:
  - Must be relative paths (./ or ../)
  - Must be JavaScript files (.js)
  - Valid entry points only

### 2. Example Manifest

**File:** `/app/plugins/core/notifications/manifest.json`

```json
{
  "id": "core.notifications",
  "name": "Notifications Plugin",
  "version": "1.0.0",
  "description": "Handles Teams notifications and system integration",
  "author": "Teams for Linux",
  "license": "MIT",
  "permissions": [
    "notifications:show",
    "notifications:sound",
    "notifications:permission",
    "notifications:badge",
    "tray:update",
    "events:emit",
    "events:subscribe",
    "config:read",
    "logging"
  ],
  "dependencies": [],
  "entryPoints": {
    "preload": "./preload.js"
  }
}
```

### 3. Validation Rules

#### ID Format
- Pattern: `^[a-zA-Z0-9._-]+$`
- Valid: "core.notifications", "plugin-name", "my_plugin"
- Invalid: "invalid id", "plugin@name!"

#### Description
- Must be non-empty string
- Maximum length: 500 characters

#### Permissions
- Pattern: `^[a-zA-Z0-9_-]+(:[a-zA-Z0-9_-]+)?$` or `*`
- Valid formats:
  - "namespace:action" (e.g., "events:emit")
  - Single word (e.g., "logging")
  - Wildcard "*"
- Invalid: "invalid@permission!", "space permission"

#### Entry Points
- Must be object with valid keys: "main", "preload", "renderer"
- Paths must start with "./" or "../"
- Must end with ".js"
- Valid: "./index.js", "../lib/plugin.js"
- Invalid: "index.js", "./index.ts"

#### Dependencies
- Array of non-empty strings
- Each string is a plugin ID

## Error Messages

All validation errors provide clear, helpful messages:

```javascript
// Missing required fields
"Invalid manifest: missing required fields name, version"

// Invalid version
"Invalid version format: 1.0. Expected semver format (e.g., 1.0.0)"

// Invalid ID
"Invalid id format: invalid@id!. Use only alphanumeric characters, dots, hyphens, or underscores"

// Invalid permission
"Invalid permission format: invalid@permission!. Expected format: \"namespace:action\" or single word (e.g., \"events:emit\", \"logging\")"

// Invalid entry point
"Entry point \"main\" must be a relative path starting with ./ or ../"
"Entry point \"main\" must be a JavaScript file (.js)"
```

## Testing

### Backward Compatibility
All existing tests pass without modification:
- 20 existing PluginManager tests ✓
- Tests only require `name` and `version` fields

### New Validation Tests
26 new tests covering:
- ID format validation (4 tests)
- Description validation (3 tests)
- Permissions validation (5 tests)
- Dependencies validation (3 tests)
- Entry points validation (5 tests)
- Metadata validation (5 tests)
- Complete manifest validation (1 test)

**Test File:** `/tests/unit/core/PluginManager.manifest-validation.test.js`

**Results:** 46/46 tests passing ✓

## Usage

### Loading Plugin with Manifest

```javascript
const PluginManager = require('./app/core/PluginManager');
const NotificationsPlugin = require('./app/plugins/core/notifications');
const manifest = require('./app/plugins/core/notifications/manifest.json');

const manager = new PluginManager(services);

// Load with full manifest
await manager.loadPlugin('core.notifications', NotificationsPlugin, manifest);

// Or minimal manifest (backward compatible)
await manager.loadPlugin('plugin-id', PluginClass, {
  name: 'My Plugin',
  version: '1.0.0'
});
```

### Permission Validation

```javascript
// Valid permissions
{
  permissions: [
    "events:emit",        // namespace:action format
    "logging",            // single word
    "*"                   // wildcard
  ]
}

// Invalid permissions
{
  permissions: [
    "invalid@permission!", // special characters
    "space permission"     // spaces not allowed
  ]
}
```

## Benefits

1. **Type Safety** - Catch configuration errors early
2. **Clear Errors** - Helpful validation messages
3. **Security** - Validate permission syntax
4. **Documentation** - Self-documenting manifest format
5. **Backward Compatible** - Existing code unchanged
6. **Extensible** - Easy to add new validation rules

## Migration Guide

### For New Plugins
Create a complete `manifest.json` with all fields:

```json
{
  "id": "plugin-id",
  "name": "Plugin Name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Author Name",
  "license": "MIT",
  "permissions": ["events:emit", "config:read"],
  "dependencies": [],
  "entryPoints": {
    "main": "./index.js",
    "preload": "./preload.js"
  }
}
```

### For Existing Plugins
No changes required. Minimal manifest still works:

```json
{
  "name": "Plugin Name",
  "version": "1.0.0"
}
```

Add optional fields incrementally as needed.

## Future Enhancements

Potential improvements:
- Semantic version range validation for dependencies
- Permission categorization (read/write)
- Runtime permission checking
- Manifest schema versioning
- Auto-generation from JSDoc comments

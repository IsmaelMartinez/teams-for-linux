# Cache Manager

Prevents cache corruption issues by automatically cleaning cache when it grows too large (issue #1756).

## Key Features

- **Automatic monitoring**: Checks cache size hourly
- **Smart cleanup**: Removes non-essential files, preserves login tokens
- **Configurable**: Adjustable size limits and intervals
- **Safe**: Won't break authentication or settings

## Implementation

The cache manager automatically detects the configured partition and cleans appropriate directories when cache exceeds the threshold (default: 300MB).

Preserves essential data:
- Authentication tokens
- User preferences  
- Persistent storage

For configuration details, see [`../../docs-site/docs/configuration.md`](../../docs-site/docs/configuration.md#cache-management).

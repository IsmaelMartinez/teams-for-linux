# Cache Manager

This module addresses issue #1756: Daily logout due to cache overflow.

## Problem

Teams for Linux users experience daily logouts caused by Electron/Chromium cache growing too large (typically >500MB), which corrupts OAuth tokens and forces re-authentication.

## Solution

The Cache Manager provides automatic cache cleanup to prevent token corruption:

- **Monitors cache size**: Checks cache directory size periodically
- **Automatic cleanup**: Removes non-essential cache files when size exceeds threshold
- **Configurable**: Adjustable size limits and check intervals
- **Safe**: Preserves essential authentication data while cleaning temporary files

## Configuration

**The Cache Manager is disabled by default and must be explicitly enabled.**

Add to your Teams for Linux config:

```json
{
  "cacheManagement": {
    "enabled": true,
    "maxCacheSizeMB": 300,
    "cacheCheckIntervalMs": 3600000
  }
}
```

**Configuration Options:**
- `enabled` (boolean): Enable/disable cache management (default: **false**)
- `maxCacheSizeMB` (number): Maximum cache size in MB before cleanup (default: 300)
- `cacheCheckIntervalMs` (number): Check interval in milliseconds (default: 3600000 = 1 hour)

## What Gets Cleaned

- **Cache directories**: Main cache, GPU cache, code cache
- **Partition caches**: Teams-specific cached data (uses your configured partition name)
- **Temporary files**: WAL files that can cause token corruption
- **Storage databases**: IndexedDB and WebStorage (non-essential parts)

The cache manager automatically detects your partition configuration (default: `persist:teams-4-linux`) and cleans the appropriate directories.

## What's Preserved

- **Authentication tokens**: Core login credentials
- **User preferences**: Settings and configuration
- **Persistent storage**: Essential application data

## Monitoring

Cache statistics are logged with debug level logging enabled:

```bash
teams-for-linux --logConfig='{"level":"debug"}'
```

Look for log entries with 🧹 prefix for cache management activities.

## Manual Cache Cleanup

If you need to manually clean cache:

```bash
# Stop Teams for Linux first
pkill -f "teams-for-linux"

# Remove cache directories
rm -rf ~/.config/teams-for-linux/Cache/*
rm -rf ~/.config/teams-for-linux/Partitions/teams-4-linux/Cache/*
rm -rf ~/.config/teams-for-linux/Partitions/teams-4-linux/IndexedDB/*

# Remove problematic temporary files
rm -f ~/.config/teams-for-linux/DIPS-wal
rm -f ~/.config/teams-for-linux/SharedStorage-wal
rm -f ~/.config/teams-for-linux/Cookies-journal
```

## Integration

The Cache Manager is automatically integrated into the main application lifecycle and starts monitoring when Teams for Linux launches.

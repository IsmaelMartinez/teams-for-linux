# Partitions Manager Module

## Overview

The Partitions Manager handles partition storage and zoom level persistence for Teams for Linux. Each partition can have its own zoom level setting, allowing users to have different zoom preferences for different Teams accounts or workspaces.

## Architecture

### Class: `PartitionsManager`

**Purpose:** Manages partition configuration storage and retrieval.

**Dependencies:**
- `settingsStore` - Settings storage instance from AppConfiguration

**State:**
- `#settingsStore` - Private field holding the settings store reference

## Public API

### `initialize()`

Registers IPC handlers for partition operations. Must be called after instantiation.

**IPC Channels Registered:**
- `get-zoom-level` - Get zoom level for a specific partition
- `save-zoom-level` - Save zoom level for a specific partition

## Usage

```javascript
const PartitionsManager = require('./partitions/manager');
const partitionsManager = new PartitionsManager(appConfig.settingsStore);
partitionsManager.initialize();
```

## Data Storage

Partitions are stored in the settings store under `app.partitions` as an array of partition objects:

```javascript
{
  name: "partition-name",    // Unique partition identifier
  zoomLevel: 1.5            // Zoom level (0 = default, negative = zoom out, positive = zoom in)
}
```

## IPC Protocol

### `get-zoom-level`

**Request:**
```javascript
ipcRenderer.invoke('get-zoom-level', partitionName)
```

**Response:**
```javascript
// Returns the zoom level (number) or 0 if not set
```

### `save-zoom-level`

**Request:**
```javascript
ipcRenderer.invoke('save-zoom-level', {
  partition: 'partition-name',
  zoomLevel: 1.5
})
```

**Response:**
```javascript
// No return value (Promise resolves when saved)
```

## Implementation Details

### Storage Strategy

Partitions are stored as an array in the settings store. When saving a partition:
1. If a partition with the same name exists, it is updated
2. If no partition exists with that name, it is added to the array
3. The entire partitions array is saved back to the settings store

This approach ensures:
- No duplicate partitions (keyed by name)
- Simple append-or-update logic
- Persistence across application restarts

## Testing

To test the PartitionsManager:

```javascript
const mockSettingsStore = {
  get: jest.fn(() => []),
  set: jest.fn()
};

const manager = new PartitionsManager(mockSettingsStore);
manager.initialize();

// Test zoom level retrieval and saving via IPC
```

## Related Documentation

- [IPC API Documentation](../../docs-site/docs/development/ipc-api.md)
- [Configuration Guide](../../docs-site/docs/configuration.md)
- [Contributing Guide](../../docs-site/docs/development/contributing.md)

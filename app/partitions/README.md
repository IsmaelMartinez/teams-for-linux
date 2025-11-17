# Partitions Manager Module

Manages partition storage and zoom level persistence per partition.

## PartitionsManager Class

Handles partition configuration storage and retrieval from the settings store.

**Dependencies:**
- `settingsStore` - Settings storage instance from AppConfiguration

**IPC Channels:**
- `get-zoom-level` - Get zoom level for a partition
- `save-zoom-level` - Save zoom level for a partition

**Usage:**
```javascript
const partitionsManager = new PartitionsManager(appConfig.settingsStore);
partitionsManager.initialize();
```

**Storage Format:**
Partitions stored in `app.partitions` as array:
```javascript
{ name: "partition-name", zoomLevel: 1.5 }
```

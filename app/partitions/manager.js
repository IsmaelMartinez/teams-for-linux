const { ipcMain } = require("electron");

/**
 * PartitionsManager
 *
 * Handles partition management for Teams for Linux.
 * This service is responsible for:
 * - Managing partition storage and retrieval
 * - Handling zoom level persistence per partition
 * - Providing IPC handlers for partition-related operations
 *
 * Dependencies are injected to improve testability and decouple from global state.
 */
class PartitionsManager {
  #settingsStore;

  /**
   * Create a PartitionsManager
   *
   * @param {Object} settingsStore - Settings storage instance (from AppConfiguration)
   */
  constructor(settingsStore) {
    this.#settingsStore = settingsStore;
  }

  /**
   * Register IPC handlers for partition operations
   * Call this method after instantiation to set up IPC communication
   */
  initialize() {
    ipcMain.handle("get-zoom-level", this.#handleGetZoomLevel.bind(this));
    ipcMain.handle("save-zoom-level", this.#handleSaveZoomLevel.bind(this));
  }

  /**
   * IPC handler for getting zoom level for a partition
   * @private
   */
  async #handleGetZoomLevel(_event, name) {
    const partition = this.#getPartition(name) || {};
    return partition.zoomLevel ? partition.zoomLevel : 0;
  }

  /**
   * IPC handler for saving zoom level for a partition
   * @private
   */
  async #handleSaveZoomLevel(_event, args) {
    const partition = this.#getPartition(args.partition) || {};
    partition.name = args.partition;
    partition.zoomLevel = args.zoomLevel;
    this.#savePartition(partition);
  }

  /**
   * Get all partitions from settings store
   * @private
   * @returns {Array} Array of partition objects
   */
  #getPartitions() {
    return this.#settingsStore.get("app.partitions") || [];
  }

  /**
   * Get a specific partition by name
   * @private
   * @param {string} name - Partition name
   * @returns {Object|undefined} Partition object or undefined if not found
   */
  #getPartition(name) {
    const partitions = this.#getPartitions();
    return partitions.find((p) => {
      return p.name === name;
    });
  }

  /**
   * Save a partition to settings store
   * Updates existing partition or adds new one
   * @private
   * @param {Object} partition - Partition object to save
   * @param {string} partition.name - Partition name (required)
   * @param {number} [partition.zoomLevel] - Zoom level for this partition
   */
  #savePartition(partition) {
    const partitions = this.#getPartitions();
    const partitionIndex = partitions.findIndex((p) => {
      return p.name === partition.name;
    });

    if (partitionIndex >= 0) {
      partitions[partitionIndex] = partition;
    } else {
      partitions.push(partition);
    }
    this.#settingsStore.set("app.partitions", partitions);
  }
}

module.exports = PartitionsManager;

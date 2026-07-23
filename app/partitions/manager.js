const { ipcMain } = require("electron");

class PartitionsManager {
  #settingsStore;
  #config;

  constructor(settingsStore, config) {
    this.#settingsStore = settingsStore;
    this.#config = config || {};
  }

  initialize() {
    // Get current zoom level for a partition
    ipcMain.handle("get-zoom-level", this.#handleGetZoomLevel.bind(this));
    // Save zoom level for a partition
    ipcMain.handle("save-zoom-level", this.#handleSaveZoomLevel.bind(this));
    // Save the persisted localStorage snapshot for a partition
    ipcMain.on("save-persisted-localstorage", this.#handleSaveLocalStorage.bind(this));
    // Get the persisted localStorage snapshot for a partition
    ipcMain.on("get-persisted-localstorage", this.#handleGetLocalStorage.bind(this));
  }

  async #handleGetZoomLevel(_event, name) {
    const partition = this.#getPartition(name) || {};
    return partition.zoomLevel ? partition.zoomLevel : 0;
  }

  async #handleSaveZoomLevel(_event, args) {
    this.#savePartition({ name: args.partition, zoomLevel: args.zoomLevel });
  }

  #handleSaveLocalStorage(_event, args) {
    if (!args || typeof args.entries !== "object" || args.entries === null) {
      return;
    }
    this.#savePartition({ name: args.partition, localStorage: args.entries });
  }

  #handleGetLocalStorage(event) {
    const partition = this.#getPartition(this.#config.partition) || {};
    event.returnValue = { entries: partition.localStorage || {} };
  }

  #getPartitions() {
    return this.#settingsStore.get("app.partitions") || [];
  }

  #getPartition(name) {
    const partitions = this.#getPartitions();
    return partitions.find((p) => p.name === name);
  }

  #savePartition(partition) {
    const partitions = this.#getPartitions();
    const partitionIndex = partitions.findIndex((p) => p.name === partition.name);

    if (partitionIndex >= 0) {
      // Merge so updating one field preserves the others stored for the same partition.
      partitions[partitionIndex] = { ...partitions[partitionIndex], ...partition };
    } else {
      partitions.push(partition);
    }
    this.#settingsStore.set("app.partitions", partitions);
  }
}

module.exports = PartitionsManager;

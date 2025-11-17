const { ipcMain } = require("electron");

class PartitionsManager {
  #settingsStore;

  constructor(settingsStore) {
    this.#settingsStore = settingsStore;
  }

  initialize() {
    ipcMain.handle("get-zoom-level", this.#handleGetZoomLevel.bind(this));
    ipcMain.handle("save-zoom-level", this.#handleSaveZoomLevel.bind(this));
  }

  async #handleGetZoomLevel(_event, name) {
    const partition = this.#getPartition(name) || {};
    return partition.zoomLevel ? partition.zoomLevel : 0;
  }

  async #handleSaveZoomLevel(_event, args) {
    const partition = this.#getPartition(args.partition) || {};
    partition.name = args.partition;
    partition.zoomLevel = args.zoomLevel;
    this.#savePartition(partition);
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
      partitions[partitionIndex] = partition;
    } else {
      partitions.push(partition);
    }
    this.#settingsStore.set("app.partitions", partitions);
  }
}

module.exports = PartitionsManager;

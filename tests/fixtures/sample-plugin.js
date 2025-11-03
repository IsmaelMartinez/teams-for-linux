/**
 * Sample Plugin for Testing
 * A simple plugin implementation used in tests
 */

export class SamplePlugin {
  constructor(config = {}) {
    this.name = config.name || 'sample-plugin';
    this.version = config.version || '1.0.0';
    this.enabled = config.enabled !== false;
    this.context = null;
    this.lifecycle = {
      initialized: false,
      started: false,
      stopped: false,
      destroyed: false,
    };
    this.data = config.data || {};
  }

  async initialize(context) {
    this.context = context;
    this.lifecycle.initialized = true;
    if (this.data.throwOnInit) {
      throw new Error('Initialization failed');
    }
  }

  async start() {
    if (!this.lifecycle.initialized) {
      throw new Error('Plugin must be initialized before starting');
    }
    this.lifecycle.started = true;
    if (this.data.throwOnStart) {
      throw new Error('Start failed');
    }
  }

  async stop() {
    if (!this.lifecycle.started) {
      throw new Error('Plugin must be started before stopping');
    }
    this.lifecycle.stopped = true;
    if (this.data.throwOnStop) {
      throw new Error('Stop failed');
    }
  }

  async destroy() {
    this.lifecycle.destroyed = true;
    this.context = null;
    if (this.data.throwOnDestroy) {
      throw new Error('Destroy failed');
    }
  }

  getData(key) {
    return this.data[key];
  }

  setData(key, value) {
    this.data[key] = value;
  }
}

/**
 * Sample service for testing
 */
export class SampleService {
  constructor(name = 'sample-service') {
    this.name = name;
    this.data = new Map();
  }

  async set(key, value) {
    this.data.set(key, value);
  }

  async get(key) {
    return this.data.get(key);
  }

  async has(key) {
    return this.data.has(key);
  }

  async delete(key) {
    return this.data.delete(key);
  }

  async clear() {
    this.data.clear();
  }

  async size() {
    return this.data.size;
  }
}

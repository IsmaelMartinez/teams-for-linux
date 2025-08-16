const { performance } = require('perf_hooks');


/**
 * IPC Performance Benchmark Utility
 * 
 * Provides tools to measure IPC handler performance and establish
 * baseline metrics before migration.
 */
class IPCBenchmark {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Start timing an IPC operation
   * @param {string} channel - IPC channel name
   * @param {string} operationId - Unique operation identifier
   */
  startTiming(channel, operationId = null) {
    const id = operationId || `${channel}-${Date.now()}`;
    const startTime = performance.now();
    
    if (!this.metrics.has(channel)) {
      this.metrics.set(channel, {
        channel,
        measurements: [],
        totalCalls: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0
      });
    }

    return {
      id,
      startTime,
      channel,
      end: () => this.endTiming(channel, id, startTime)
    };
  }

  /**
   * End timing an IPC operation
   * @param {string} channel - IPC channel name
   * @param {string} operationId - Operation identifier
   * @param {number} startTime - Start time from performance.now()
   */
  endTiming(channel, operationId, startTime) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    const channelMetrics = this.metrics.get(channel);
    if (!channelMetrics) {
      console.warn(`[IPC-Benchmark] No metrics found for channel: ${channel}`);
      return duration;
    }

    // Update metrics
    channelMetrics.measurements.push({
      operationId,
      duration,
      timestamp: new Date()
    });
    
    channelMetrics.totalCalls++;
    channelMetrics.totalTime += duration;
    channelMetrics.averageTime = channelMetrics.totalTime / channelMetrics.totalCalls;
    channelMetrics.minTime = Math.min(channelMetrics.minTime, duration);
    channelMetrics.maxTime = Math.max(channelMetrics.maxTime, duration);

    console.debug(`[IPC-Benchmark] IPC timing for ${channel}: ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * Wrap an IPC handler with performance timing
   * @param {string} channel - IPC channel name
   * @param {Function} handler - Original handler function
   * @returns {Function} Wrapped handler with timing
   */
  wrapHandler(channel, handler) {
    return async (event, ...args) => {
      const timer = this.startTiming(channel);
      try {
        const result = await handler(event, ...args);
        timer.end();
        return result;
      } catch (error) {
        timer.end();
        throw error;
      }
    };
  }

  /**
   * Get performance metrics for a specific channel
   * @param {string} channel - IPC channel name
   * @returns {Object|null} Channel metrics or null if not found
   */
  getChannelMetrics(channel) {
    return this.metrics.get(channel) || null;
  }

  /**
   * Get performance metrics for all channels
   * @returns {Array} Array of channel metrics
   */
  getAllMetrics() {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.totalCalls - a.totalCalls); // Sort by usage
  }

  /**
   * Get summary statistics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const channels = Array.from(this.metrics.values());
    
    if (channels.length === 0) {
      return {
        totalChannels: 0,
        totalCalls: 0,
        totalTime: 0,
        averageTimePerCall: 0,
        slowestChannel: null,
        fastestChannel: null
      };
    }

    const totalCalls = channels.reduce((sum, ch) => sum + ch.totalCalls, 0);
    const totalTime = channels.reduce((sum, ch) => sum + ch.totalTime, 0);
    const averageTimePerCall = totalTime / totalCalls;

    const slowestChannel = channels.reduce((slowest, ch) => 
      ch.averageTime > slowest.averageTime ? ch : slowest
    );

    const fastestChannel = channels.reduce((fastest, ch) => 
      ch.averageTime < fastest.averageTime ? ch : fastest
    );

    return {
      totalChannels: channels.length,
      totalCalls,
      totalTime,
      averageTimePerCall,
      slowestChannel: {
        channel: slowestChannel.channel,
        averageTime: slowestChannel.averageTime,
        maxTime: slowestChannel.maxTime
      },
      fastestChannel: {
        channel: fastestChannel.channel,
        averageTime: fastestChannel.averageTime,
        minTime: fastestChannel.minTime
      }
    };
  }

  /**
   * Generate a performance report
   * @returns {string} Formatted performance report
   */
  generateReport() {
    const summary = this.getSummary();
    const channels = this.getAllMetrics();

    let report = '=== IPC Performance Report ===\n\n';
    
    report += 'Summary:\n';
    report += `  Total Channels: ${summary.totalChannels}\n`;
    report += `  Total Calls: ${summary.totalCalls}\n`;
    report += `  Total Time: ${summary.totalTime.toFixed(2)}ms\n`;
    report += `  Average Time per Call: ${summary.averageTimePerCall.toFixed(2)}ms\n\n`;

    if (summary.slowestChannel) {
      report += `  Slowest Channel: ${summary.slowestChannel.channel} (avg: ${summary.slowestChannel.averageTime.toFixed(2)}ms)\n`;
      report += `  Fastest Channel: ${summary.fastestChannel.channel} (avg: ${summary.fastestChannel.averageTime.toFixed(2)}ms)\n\n`;
    }

    report += 'Channel Details:\n';
    for (const channel of channels) {
      report += `  ${channel.channel}:\n`;
      report += `    Calls: ${channel.totalCalls}\n`;
      report += `    Avg: ${channel.averageTime.toFixed(2)}ms\n`;
      report += `    Min: ${channel.minTime.toFixed(2)}ms\n`;
      report += `    Max: ${channel.maxTime.toFixed(2)}ms\n`;
      report += `    Total: ${channel.totalTime.toFixed(2)}ms\n\n`;
    }

    return report;
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics.clear();
    console.info('Cleared all performance metrics');
  }

  /**
   * Export metrics to JSON
   * @returns {Object} Metrics data in JSON format
   */
  exportMetrics() {
    const data = {
      summary: this.getSummary(),
      channels: this.getAllMetrics(),
      exportedAt: new Date()
    };
    
    return data;
  }

  /**
   * Save baseline metrics for comparison
   * @param {string} name - Baseline name (e.g., 'before-migration')
   */
  saveBaseline(name) {
    const baseline = {
      name,
      timestamp: new Date(),
      metrics: this.exportMetrics()
    };

    // In a real implementation, this could save to a file
    console.info(`[IPC-Benchmark] Baseline '${name}' saved with ${baseline.metrics.summary.totalChannels} channels`);
    
    return baseline;
  }
}

// Export singleton instance
const ipcBenchmark = new IPCBenchmark();
module.exports = ipcBenchmark;
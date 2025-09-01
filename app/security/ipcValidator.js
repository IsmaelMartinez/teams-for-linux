/**
 * IPC Security Validation Module
 * 
 * Provides security validation for IPC channels as a compensating control
 * for disabled contextIsolation and sandbox features.
 * 
 * This module implements:
 * - Channel allowlisting to prevent unauthorized IPC access
 * - Basic payload sanitization to prevent prototype pollution
 * - Request logging for security monitoring
 */

class IpcValidator {
  constructor() {
    // Allowlist of legitimate IPC channels used by Teams for Linux
    this.allowedChannels = new Set([
      // Core application channels
      'config-file-changed',
      'get-config',
      'get-system-idle-state',
      'get-app-version',
      
      // Zoom and display controls
      'get-zoom-level',
      'save-zoom-level',
      
      // Screen sharing and desktop capture
      'desktop-capturer-get-sources',
      'choose-desktop-media',
      'cancel-desktop-media',
      'select-source',
      'get-screen-sharing-status',
      'get-screen-share-stream',
      'get-screen-share-screen',
      'screen-sharing-stopped',
      'resize-preview-window',
      'stop-screen-sharing-from-thumbnail',
      
      // Notifications and user interaction
      'play-notification-sound',
      'show-notification',
      'user-status-changed',
      'set-badge-count',
      'tray-update',
      
      // Call management
      'incoming-call-created',
      'incoming-call-ended',
      'incoming-call-action',
      'call-connected',
      'call-disconnected',
      
      // Authentication and forms
      'submitForm',
      
      // Custom backgrounds
      'get-custom-bg-list',
      
      // Connection management
      'offline-retry'
    ]);

    this.blockedChannels = new Set();
    this.validationStats = {
      allowed: 0,
      blocked: 0,
      sanitized: 0
    };
  }

  /**
   * Validates an IPC channel request
   * @param {string} channel - The IPC channel name
   * @param {any} payload - The payload being sent
   * @returns {boolean} - True if request is valid, false if blocked
   */
  validateChannel(channel, payload = null) {
    // Check channel allowlist
    if (!this.allowedChannels.has(channel)) {
      this.blockedChannels.add(channel);
      this.validationStats.blocked++;
      
      console.warn(`[IPC Security] Blocked unauthorized channel: ${channel}`);
      console.warn(`[IPC Security] Payload type: ${typeof payload}`);
      
      return false;
    }

    // Sanitize payload if present
    if (payload !== null && payload !== undefined) {
      this.sanitizePayload(payload);
    }

    this.validationStats.allowed++;
    console.debug(`[IPC Security] Validated channel: ${channel}`);
    
    return true;
  }

  /**
   * Sanitizes IPC payload to prevent prototype pollution and injection attacks
   * @param {any} payload - The payload to sanitize
   * @returns {any} - The sanitized payload
   */
  sanitizePayload(payload) {
    if (typeof payload !== 'object' || payload === null) {
      return payload;
    }

    // Track if sanitization occurred
    let sanitized = false;

    // Remove dangerous prototype properties
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    
    for (const key of dangerousKeys) {
      if (key in payload) {
        delete payload[key];
        sanitized = true;
      }
    }

    // Recursively sanitize nested objects
    for (const key in payload) {
      if (payload.hasOwnProperty(key) && typeof payload[key] === 'object') {
        this.sanitizePayload(payload[key]);
      }
    }

    if (sanitized) {
      this.validationStats.sanitized++;
      console.debug('[IPC Security] Sanitized payload - removed dangerous properties');
    }

    return payload;
  }

  /**
   * Gets current validation statistics
   * @returns {object} - Validation statistics
   */
  getStats() {
    return {
      ...this.validationStats,
      blockedChannels: Array.from(this.blockedChannels)
    };
  }

  /**
   * Resets validation statistics
   */
  resetStats() {
    this.validationStats = { allowed: 0, blocked: 0, sanitized: 0 };
    this.blockedChannels.clear();
  }

  /**
   * Adds a channel to the allowlist (for dynamic extensions)
   * @param {string} channel - Channel name to allow
   */
  allowChannel(channel) {
    if (typeof channel === 'string' && channel.length > 0) {
      this.allowedChannels.add(channel);
      console.debug(`[IPC Security] Added channel to allowlist: ${channel}`);
    }
  }

  /**
   * Removes a channel from the allowlist
   * @param {string} channel - Channel name to disallow
   */
  disallowChannel(channel) {
    this.allowedChannels.delete(channel);
    console.debug(`[IPC Security] Removed channel from allowlist: ${channel}`);
  }
}

module.exports = new IpcValidator();
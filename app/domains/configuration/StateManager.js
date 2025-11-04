const EventBus = require('../../core/EventBus');

/**
 * StateManager - Global application state management
 *
 * Replaces global variables with event-driven state management:
 * - userStatus: User presence status (-1 = unknown, 0-4 = Teams status)
 * - idleTimeUserStatus: Saved status before idle
 * - screenSharingActive: Whether screen sharing is active
 * - currentScreenShareSourceId: Current screen share source ID
 *
 * Emits events on state changes:
 * - 'state.user.statusChanged' - User status changed
 * - 'state.user.idleStatusChanged' - Idle status changed
 * - 'state.screenshare.activeChanged' - Screen share active state changed
 * - 'state.screenshare.sourceChanged' - Screen share source changed
 *
 * Usage:
 *   const stateManager = new StateManager();
 *   stateManager.setUserStatus(2); // Available
 *   const status = stateManager.getUserStatus();
 */
class StateManager {
  constructor() {
    // Direct property access for better performance
    this._userStatus = -1; // -1 = unknown
    this._idleTimeUserStatus = -1;
    this._screenSharingActive = false;
    this._currentScreenShareSourceId = null;
    this._customState = new Map();
    this._eventBus = EventBus.getInstance();
  }

  /**
   * Emit state change event
   * @private
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  _emitChange(event, data) {
    this._eventBus.emit(event, data);
  }

  // ============================================================================
  // User Status Management
  // ============================================================================

  /**
   * Get current user status
   * @returns {number} User status (-1 = unknown, 0-4 = Teams status)
   */
  getUserStatus() {
    return this._userStatus;
  }

  /**
   * Set user status
   * @param {number} status - New user status
   * @fires state.user.statusChanged
   */
  setUserStatus(status) {
    const oldStatus = this._userStatus;

    if (oldStatus !== status) {
      this._userStatus = status;
      this._emitChange('state.user.statusChanged', {
        oldStatus,
        newStatus: status,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get idle time user status
   * @returns {number} Saved status before idle
   */
  getIdleTimeUserStatus() {
    return this._idleTimeUserStatus;
  }

  /**
   * Set idle time user status
   * @param {number} status - Status to save before going idle
   * @fires state.user.idleStatusChanged
   */
  setIdleTimeUserStatus(status) {
    const oldStatus = this._idleTimeUserStatus;

    if (oldStatus !== status) {
      this._idleTimeUserStatus = status;
      this._emitChange('state.user.idleStatusChanged', {
        oldStatus,
        newStatus: status,
        timestamp: Date.now()
      });
    }
  }

  // ============================================================================
  // Screen Sharing State Management
  // ============================================================================

  /**
   * Check if screen sharing is active
   * @returns {boolean} True if screen sharing is active
   */
  isScreenSharingActive() {
    return this._screenSharingActive;
  }

  /**
   * Set screen sharing active state
   * @param {boolean} active - Whether screen sharing is active
   * @fires state.screenshare.activeChanged
   */
  setScreenSharingActive(active) {
    const oldActive = this._screenSharingActive;

    if (oldActive !== active) {
      this._screenSharingActive = active;
      this._emitChange('state.screenshare.activeChanged', {
        active,
        sourceId: this._currentScreenShareSourceId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get current screen share source ID
   * @returns {string|null} Screen share source ID or null
   */
  getCurrentScreenShareSourceId() {
    return this._currentScreenShareSourceId;
  }

  /**
   * Set current screen share source ID
   * @param {string|null} sourceId - Screen share source ID
   * @fires state.screenshare.sourceChanged
   */
  setCurrentScreenShareSourceId(sourceId) {
    const oldSourceId = this._currentScreenShareSourceId;

    if (oldSourceId !== sourceId) {
      this._currentScreenShareSourceId = sourceId;
      this._emitChange('state.screenshare.sourceChanged', {
        oldSourceId,
        newSourceId: sourceId,
        active: this._screenSharingActive,
        timestamp: Date.now()
      });
    }
  }

  // ============================================================================
  // Custom State Management (for plugins/extensions)
  // ============================================================================

  /**
   * Get custom state value
   * @param {string} key - State key
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} State value or default
   */
  getCustomState(key, defaultValue = undefined) {
    return this._customState.has(key)
      ? this._customState.get(key)
      : defaultValue;
  }

  /**
   * Set custom state value
   * @param {string} key - State key
   * @param {*} value - State value
   * @fires state.custom.changed
   */
  setCustomState(key, value) {
    const oldValue = this._customState.get(key);

    this._customState.set(key, value);

    this._emitChange('state.custom.changed', {
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    });
  }

  /**
   * Delete custom state value
   * @param {string} key - State key
   * @returns {boolean} True if key existed and was deleted
   * @fires state.custom.deleted
   */
  deleteCustomState(key) {
    const existed = this._customState.has(key);
    const oldValue = this._customState.get(key);

    if (existed) {
      this._customState.delete(key);
      this._emitChange('state.custom.deleted', {
        key,
        oldValue,
        timestamp: Date.now()
      });
    }

    return existed;
  }

  /**
   * Clear all custom state
   * @fires state.custom.cleared
   */
  clearCustomState() {
    const count = this._customState.size;

    this._customState.clear();

    this._emitChange('state.custom.cleared', {
      count,
      timestamp: Date.now()
    });
  }

  // ============================================================================
  // State Snapshot & Restore
  // ============================================================================

  /**
   * Get complete state snapshot
   * @returns {Object} Current state snapshot
   */
  getSnapshot() {
    return {
      userStatus: this._userStatus,
      idleTimeUserStatus: this._idleTimeUserStatus,
      screenSharingActive: this._screenSharingActive,
      currentScreenShareSourceId: this._currentScreenShareSourceId,
      customState: Object.fromEntries(this._customState)
    };
  }

  /**
   * Restore state from snapshot
   * @param {Object} snapshot - State snapshot to restore
   */
  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Invalid snapshot: must be an object');
    }

    // Restore core state
    if (typeof snapshot.userStatus === 'number') {
      this.setUserStatus(snapshot.userStatus);
    }

    if (typeof snapshot.idleTimeUserStatus === 'number') {
      this.setIdleTimeUserStatus(snapshot.idleTimeUserStatus);
    }

    if (typeof snapshot.screenSharingActive === 'boolean') {
      this.setScreenSharingActive(snapshot.screenSharingActive);
    }

    if (snapshot.currentScreenShareSourceId !== undefined) {
      this.setCurrentScreenShareSourceId(snapshot.currentScreenShareSourceId);
    }

    // Restore custom state
    if (snapshot.customState && typeof snapshot.customState === 'object') {
      this._customState.clear();
      for (const [key, value] of Object.entries(snapshot.customState)) {
        this._customState.set(key, value);
      }
    }
  }

  /**
   * Reset all state to defaults
   * @fires state.reset
   */
  reset() {
    this._userStatus = -1;
    this._idleTimeUserStatus = -1;
    this._screenSharingActive = false;
    this._currentScreenShareSourceId = null;
    this._customState.clear();

    this._emitChange('state.reset', {
      timestamp: Date.now()
    });
  }

  /**
   * Get state statistics
   * @returns {Object} Statistics about current state
   */
  getStats() {
    return {
      userStatus: this._userStatus,
      idleTimeUserStatus: this._idleTimeUserStatus,
      screenSharingActive: this._screenSharingActive,
      hasScreenShareSource: this._currentScreenShareSourceId !== null,
      customStateCount: this._customState.size
    };
  }
}

module.exports = StateManager;

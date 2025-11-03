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
    // WeakMap pattern for private fields
    this._state = new WeakMap();

    const stateData = {
      // User presence state
      userStatus: -1, // -1 = unknown
      idleTimeUserStatus: -1,

      // Screen sharing state
      screenSharingActive: false,
      currentScreenShareSourceId: null,

      // Custom state (for extensions)
      customState: new Map()
    };

    this._state.set(this, stateData);
    this._eventBus = EventBus.getInstance();
  }

  /**
   * Get state data
   * @private
   */
  _getState() {
    return this._state.get(this);
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
    const state = this._getState();
    return state.userStatus;
  }

  /**
   * Set user status
   * @param {number} status - New user status
   * @fires state.user.statusChanged
   */
  setUserStatus(status) {
    const state = this._getState();
    const oldStatus = state.userStatus;

    if (oldStatus !== status) {
      state.userStatus = status;
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
    const state = this._getState();
    return state.idleTimeUserStatus;
  }

  /**
   * Set idle time user status
   * @param {number} status - Status to save before going idle
   * @fires state.user.idleStatusChanged
   */
  setIdleTimeUserStatus(status) {
    const state = this._getState();
    const oldStatus = state.idleTimeUserStatus;

    if (oldStatus !== status) {
      state.idleTimeUserStatus = status;
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
    const state = this._getState();
    return state.screenSharingActive;
  }

  /**
   * Set screen sharing active state
   * @param {boolean} active - Whether screen sharing is active
   * @fires state.screenshare.activeChanged
   */
  setScreenSharingActive(active) {
    const state = this._getState();
    const oldActive = state.screenSharingActive;

    if (oldActive !== active) {
      state.screenSharingActive = active;
      this._emitChange('state.screenshare.activeChanged', {
        active,
        sourceId: state.currentScreenShareSourceId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get current screen share source ID
   * @returns {string|null} Screen share source ID or null
   */
  getCurrentScreenShareSourceId() {
    const state = this._getState();
    return state.currentScreenShareSourceId;
  }

  /**
   * Set current screen share source ID
   * @param {string|null} sourceId - Screen share source ID
   * @fires state.screenshare.sourceChanged
   */
  setCurrentScreenShareSourceId(sourceId) {
    const state = this._getState();
    const oldSourceId = state.currentScreenShareSourceId;

    if (oldSourceId !== sourceId) {
      state.currentScreenShareSourceId = sourceId;
      this._emitChange('state.screenshare.sourceChanged', {
        oldSourceId,
        newSourceId: sourceId,
        active: state.screenSharingActive,
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
    const state = this._getState();
    return state.customState.has(key)
      ? state.customState.get(key)
      : defaultValue;
  }

  /**
   * Set custom state value
   * @param {string} key - State key
   * @param {*} value - State value
   * @fires state.custom.changed
   */
  setCustomState(key, value) {
    const state = this._getState();
    const oldValue = state.customState.get(key);

    state.customState.set(key, value);

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
    const state = this._getState();
    const existed = state.customState.has(key);
    const oldValue = state.customState.get(key);

    if (existed) {
      state.customState.delete(key);
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
    const state = this._getState();
    const count = state.customState.size;

    state.customState.clear();

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
    const state = this._getState();

    return {
      userStatus: state.userStatus,
      idleTimeUserStatus: state.idleTimeUserStatus,
      screenSharingActive: state.screenSharingActive,
      currentScreenShareSourceId: state.currentScreenShareSourceId,
      customState: Object.fromEntries(state.customState)
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
      const state = this._getState();
      state.customState.clear();
      for (const [key, value] of Object.entries(snapshot.customState)) {
        state.customState.set(key, value);
      }
    }
  }

  /**
   * Reset all state to defaults
   * @fires state.reset
   */
  reset() {
    const state = this._getState();

    state.userStatus = -1;
    state.idleTimeUserStatus = -1;
    state.screenSharingActive = false;
    state.currentScreenShareSourceId = null;
    state.customState.clear();

    this._emitChange('state.reset', {
      timestamp: Date.now()
    });
  }

  /**
   * Get state statistics
   * @returns {Object} Statistics about current state
   */
  getStats() {
    const state = this._getState();

    return {
      userStatus: state.userStatus,
      idleTimeUserStatus: state.idleTimeUserStatus,
      screenSharingActive: state.screenSharingActive,
      hasScreenShareSource: state.currentScreenShareSourceId !== null,
      customStateCount: state.customState.size
    };
  }
}

module.exports = StateManager;

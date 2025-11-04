const { Tray, Menu, app, nativeImage } = require('electron');

/**
 * TrayManager - System tray and platform-specific UI management
 *
 * Manages Electron Tray instance with platform-specific behavior:
 * - macOS: Uses dock for badge count and app icon
 * - Windows/Linux: Uses system tray with icon overlay
 *
 * Features:
 * - Create and manage system tray
 * - Update tray icon, tooltip, badge count
 * - Handle platform differences
 * - Manage context menu
 * - Emit events for tray interactions
 *
 * Events emitted:
 * - 'shell.tray.created' - Tray instance created
 * - 'shell.tray.clicked' - Tray icon clicked
 * - 'shell.tray.rightClicked' - Tray icon right-clicked
 * - 'shell.tray.iconUpdated' - Tray icon updated
 * - 'shell.tray.badgeUpdated' - Badge count updated
 * - 'shell.tray.tooltipUpdated' - Tooltip updated
 * - 'shell.tray.menuUpdated' - Context menu updated
 * - 'shell.tray.destroyed' - Tray destroyed
 *
 * Usage:
 *   const trayManager = new TrayManager(config, eventBus);
 *   trayManager.createTray({ iconPath, tooltip, onClick });
 *   trayManager.setBadgeCount(5);
 */
class TrayManager {
  constructor(config, eventBus) {
    this._config = config;
    this._eventBus = eventBus;
    this._tray = null;
    this._badgeCount = 0;
    this._platform = process.platform;
    this._isMac = this._platform === 'darwin';
    this._currentIconPath = null;
    this._currentTooltip = null;
  }

  /**
   * Create system tray instance
   * @param {Object} options - Tray options
   * @param {string} options.iconPath - Path to tray icon
   * @param {string} [options.tooltip] - Tray tooltip text
   * @param {Function} [options.onClick] - Click handler
   * @param {Function} [options.onRightClick] - Right-click handler
   * @param {Array} [options.menuTemplate] - Context menu template
   * @returns {Tray} Created tray instance
   * @fires shell.tray.created
   */
  createTray(options) {
    if (this._tray && !this._tray.isDestroyed()) {
      throw new Error('Tray already exists. Call cleanup() first.');
    }

    const { iconPath, tooltip, onClick, onRightClick, menuTemplate } = options;

    // Create tray with platform-specific icon handling
    const iconImage = this._getIconImage(iconPath);
    this._tray = new Tray(this._isMac ? iconImage : iconPath);
    this._currentIconPath = iconPath;

    // Set initial tooltip
    const initialTooltip = tooltip || this._config?.appTitle || 'Teams for Linux';
    this._tray.setToolTip(initialTooltip);
    this._currentTooltip = initialTooltip;

    // Attach click handlers
    if (onClick) {
      this._tray.on('click', () => {
        onClick();
        this._emitEvent('shell.tray.clicked', { timestamp: Date.now() });
      });
    }

    if (onRightClick) {
      this._tray.on('right-click', () => {
        onRightClick();
        this._emitEvent('shell.tray.rightClicked', { timestamp: Date.now() });
      });
    }

    // Set context menu if provided
    if (menuTemplate) {
      this.setContextMenu(menuTemplate);
    }

    this._emitEvent('shell.tray.created', {
      platform: this._platform,
      iconPath,
      tooltip: initialTooltip,
      timestamp: Date.now()
    });

    return this._tray;
  }

  /**
   * Update tray icon
   * @param {string} iconPath - Path to new icon or data URL
   * @fires shell.tray.iconUpdated
   */
  updateIcon(iconPath) {
    if (!this._tray || this._tray.isDestroyed()) {
      throw new Error('Tray not initialized. Call createTray() first.');
    }

    const iconImage = this._getIconImage(iconPath);
    this._tray.setImage(iconImage);
    this._currentIconPath = iconPath;

    this._emitEvent('shell.tray.iconUpdated', {
      iconPath,
      timestamp: Date.now()
    });
  }

  /**
   * Set badge count with platform-specific handling
   * @param {number} count - Badge count (0 to clear)
   * @fires shell.tray.badgeUpdated
   */
  setBadgeCount(count) {
    const numCount = Math.max(0, parseInt(count, 10) || 0);
    const oldCount = this._badgeCount;

    if (oldCount === numCount) {
      return; // No change
    }

    this._badgeCount = numCount;

    // Platform-specific badge handling
    if (this._isMac) {
      // macOS: Use dock badge
      app.setBadgeCount(numCount);
    } else {
      // Windows/Linux: Update tray tooltip with count
      this._updateTooltipWithBadge(numCount);
    }

    this._emitEvent('shell.tray.badgeUpdated', {
      oldCount,
      newCount: numCount,
      platform: this._platform,
      timestamp: Date.now()
    });
  }

  /**
   * Set tray tooltip
   * @param {string} tooltip - New tooltip text
   * @fires shell.tray.tooltipUpdated
   */
  setTooltip(tooltip) {
    if (!this._tray || this._tray.isDestroyed()) {
      throw new Error('Tray not initialized. Call createTray() first.');
    }

    const oldTooltip = this._currentTooltip;
    this._tray.setToolTip(tooltip);
    this._currentTooltip = tooltip;

    this._emitEvent('shell.tray.tooltipUpdated', {
      oldTooltip,
      newTooltip: tooltip,
      timestamp: Date.now()
    });
  }

  /**
   * Set context menu from template
   * @param {Array} menuTemplate - Electron menu template
   * @fires shell.tray.menuUpdated
   */
  setContextMenu(menuTemplate) {
    if (!this._tray || this._tray.isDestroyed()) {
      throw new Error('Tray not initialized. Call createTray() first.');
    }

    const menu = Menu.buildFromTemplate(menuTemplate);
    this._tray.setContextMenu(menu);

    this._emitEvent('shell.tray.menuUpdated', {
      menuItemCount: menuTemplate.length,
      timestamp: Date.now()
    });
  }

  /**
   * Cleanup and destroy tray
   * @fires shell.tray.destroyed
   */
  cleanup() {
    if (this._tray && !this._tray.isDestroyed()) {
      this._tray.destroy();
      this._tray = null;
    }

    // Clear badge on macOS
    if (this._isMac) {
      app.setBadgeCount(0);
    }

    this._badgeCount = 0;
    this._currentIconPath = null;
    this._currentTooltip = null;

    this._emitEvent('shell.tray.destroyed', {
      timestamp: Date.now()
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get icon image with platform-specific handling
   * @private
   * @param {string} iconPath - Icon path or data URL
   * @returns {NativeImage} Native image instance
   */
  _getIconImage(iconPath) {
    let image;

    if (iconPath.startsWith('data:')) {
      image = nativeImage.createFromDataURL(iconPath);
    } else {
      image = nativeImage.createFromPath(iconPath);
    }

    // macOS: Resize to standard tray icon size
    if (this._isMac) {
      image = image.resize({ width: 16, height: 16 });
    }

    return image;
  }

  /**
   * Update tooltip with badge count
   * @private
   * @param {number} count - Badge count
   */
  _updateTooltipWithBadge(count) {
    const baseTitle = this._config?.appTitle || 'Teams for Linux';
    const tooltip = count > 0 ? `${baseTitle} (${count})` : baseTitle;
    this.setTooltip(tooltip);
  }

  /**
   * Emit event via EventBus
   * @private
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  _emitEvent(event, data) {
    if (this._eventBus) {
      this._eventBus.emit(event, data);
    }
  }

  // ============================================================================
  // Getters
  // ============================================================================

  /**
   * Get current badge count
   * @returns {number} Current badge count
   */
  getBadgeCount() {
    return this._badgeCount;
  }

  /**
   * Get current platform
   * @returns {string} Platform name (darwin, win32, linux)
   */
  getPlatform() {
    return this._platform;
  }

  /**
   * Check if tray is initialized
   * @returns {boolean} True if tray exists and not destroyed
   */
  isInitialized() {
    return this._tray !== null && !this._tray.isDestroyed();
  }

  /**
   * Get tray instance (use with caution)
   * @returns {Tray|null} Tray instance or null
   */
  getTrayInstance() {
    return this._tray;
  }
}

module.exports = TrayManager;

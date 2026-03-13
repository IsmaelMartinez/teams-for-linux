/**
 * MQTT Status Monitor
 *
 * Monitors Teams user status and sends updates to the main process via IPC
 * for MQTT publishing to home automation systems.
 *
 * IMPORTANT: This detection is inherently fragile. It relies on DOM scraping
 * because Teams' React internals don't expose presence services and the
 * Graph API /me/presence endpoint returns 403 (Teams token lacks Presence.Read
 * scope). When Microsoft changes their DOM structure, selectors will break.
 * See: docs-site/docs/development/research/graph-api-integration-research.md
 *
 * Status Detection Strategy:
 * 1. CSS selectors targeting known Teams presence elements
 * 2. Me-control avatar button with presence badge
 * 3. Page title (unlikely fallback)
 * Uses MutationObserver for real-time DOM changes (debounced) and polls
 * periodically as a fallback.
 *
 * Status Codes:
 * 1 = Available, 2 = Busy, 3 = Do Not Disturb, 4 = Away, 5 = Be Right Back
 */

class MQTTStatusMonitor {
	init(config, ipcRenderer) {
		this.config = config;
		this.ipcRenderer = ipcRenderer;
		this.lastStatus = null;
		this.observer = null;
		this.pollInterval = null;
		this.debounceTimer = null;
		this._loggedDetection = false;

		// Status keyword mapping for efficient lookup
		this.statusKeywords = [
			{ keywords: ['do not disturb', 'dnd', 'do-not-disturb', 'focus', 'presence-dnd', 'status-dnd'], code: 3 },
			{ keywords: ['be right back', 'brb', 'berightback', 'presence-berightback', 'status-brb'], code: 5 },
			{ keywords: ['busy', 'in a call', 'in a meeting', 'red', 'presence-busy', 'status-busy'], code: 2 },
			{ keywords: ['away', 'inactive', 'yellow', 'presence-away', 'status-away'], code: 4 },
			{ keywords: ['available', 'online', 'green', 'presence-available', 'status-available'], code: 1 }
		];

		// Only start monitoring if MQTT is enabled
		if (!config.mqtt?.enabled) {
			console.debug('MQTT status monitoring disabled');
			return;
		}

		console.debug('Initializing MQTT status monitor');
		this.start();
	}

	/**
	 * Start monitoring Teams status
	 */
	start() {
		// Wait for DOM to be ready
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => this.startMonitoring());
		} else {
			// Give Teams time to fully load
			setTimeout(() => this.startMonitoring(), 3000);
		}
	}

	/**
	 * Begin active monitoring with both observer and polling
	 */
	startMonitoring() {
		console.debug('Starting Teams status monitoring for MQTT');

		// Set up mutation observer for reactive updates
		this.setupMutationObserver();

		// Set up polling as fallback
		this.startPolling();

		// Perform initial status check
		this.checkStatusChange();
	}

	/**
	 * Set up MutationObserver to watch for DOM changes
	 * Uses debouncing to avoid excessive checks on rapid DOM changes
	 */
	setupMutationObserver() {
		this.observer = new MutationObserver(() => {
			// Debounce: only check status after DOM settles (300ms of no changes)
			if (this.debounceTimer) {
				clearTimeout(this.debounceTimer);
			}
			this.debounceTimer = setTimeout(() => {
				this.checkStatusChange();
			}, 300);
		});

		// Observe the entire body for changes to status-related attributes
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'aria-label', 'title', 'data-testid']
		});

		console.debug('Mutation observer set up for status monitoring (with 300ms debounce)');
	}

	/**
	 * Start polling for status changes as fallback
	 */
	startPolling() {
		const interval = this.config.mqtt?.statusCheckInterval || 10000;

		this.pollInterval = setInterval(() => {
			this.checkStatusChange();
		}, interval);

		console.debug(`Status polling started with ${interval}ms interval`);
	}

	/**
	 * Check if status has changed and notify main process
	 */
	checkStatusChange() {
		try {
			const status = this.detectCurrentStatus();

			// Only send IPC if status actually changed
			if (status !== null && status !== this.lastStatus) {
				console.debug(`Teams status changed: ${this.lastStatus} -> ${status}`);
				this.lastStatus = status;

				// Send status change to main process
				this.ipcRenderer.invoke('user-status-changed', {
					data: { status: status }
				});
			}
		} catch (error) {
			console.debug('Status check error:', error.message);
		}
	}

	/**
	 * Detect current Teams status from UI
	 * Uses multiple DOM strategies — all inherently fragile (see file header)
	 *
	 * @returns {number|null} Status code (1-5) or null if not detected
	 */
	detectCurrentStatus() {
		// Strategy 1: Try CSS selectors for direct presence indicators
		let status = this.detectStatusFromSelectors();
		if (status !== null) {
			if (!this._loggedDetection) console.info('[MQTT Status] Detected via CSS selectors:', status);
			this._loggedDetection = true;
			return status;
		}

		// Strategy 2: Check me-control avatar button for presence indicator
		status = this.detectStatusFromMeControl();
		if (status !== null) {
			if (!this._loggedDetection) console.info('[MQTT Status] Detected via me-control:', status);
			this._loggedDetection = true;
			return status;
		}

		// Strategy 3: Check page title (unlikely but kept for compatibility)
		status = this.extractStatusFromPageTitle();
		if (status !== null) {
			if (!this._loggedDetection) console.info('[MQTT Status] Detected via page title:', status);
			this._loggedDetection = true;
			return status;
		}

		return null;
	}

	/**
	 * Detect status from CSS selectors
	 * Note: CSS attribute selectors are case-sensitive by default, so we use
	 * the 'i' flag for aria-label/title/class matching to handle different
	 * locales and varying capitalisation in Teams' DOM.
	 * @returns {number|null} Status code or null if not detected
	 */
	detectStatusFromSelectors() {
		const selectors = [
			// Teams presence badge (current as of Mar 2026)
			'[data-tid="me-control-avatar-presence"]',
			// Older Teams v2 selectors (kept for compatibility)
			'[data-tid="me-control-presence-icon"]',
			'[data-tid="presence-indicator"]',
			'[data-testid="presence-status"]',
			'[data-tid="my-status-button"]',
			// Class-based selectors (case-insensitive to match e.g. fui-PresenceBadge)
			'button[class*="presence" i]',
			'div[class*="presence" i]',
			'.fui-PresenceBadge',
			// Broad wildcard selectors (case-insensitive for locale support)
			'[aria-label*="status" i]',
			'[title*="status" i]'
		];

		return this._findStatusFromElements(selectors);
	}

	/**
	 * Find status by querying DOM selectors in order
	 * @param {string[]} selectors - CSS selectors to query
	 * @returns {number|null} Status code or null if not detected
	 */
	_findStatusFromElements(selectors) {
		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element) {
				const status = this.extractStatusFromElement(element);
				if (status !== null) {
					return status;
				}
			}
		}
		return null;
	}

	/**
	 * Detect status from me-control avatar button
	 * @returns {number|null} Status code or null if not detected
	 */
	detectStatusFromMeControl() {
		// Try both current and older data-tid values
		const meControl = document.querySelector('[data-tid="me-control-avatar-trigger"]') ||
						  document.querySelector('[data-tid="me-control-button"]');
		if (!meControl) {
			return null;
		}

		// Look for presence indicator within the me-control (case-insensitive)
		const presenceIndicator = meControl.querySelector('[class*="presence" i]') ||
								  meControl.querySelector('[data-tid*="presence"]');
		if (presenceIndicator) {
			const status = this.extractStatusFromElement(presenceIndicator);
			if (status !== null) {
				return status;
			}
		}

		// Check the me-control button itself for aria-label with status
		const meControlAriaLabel = meControl.getAttribute('aria-label') || '';
		if (meControlAriaLabel) {
			const status = this.mapTextToStatusCode(meControlAriaLabel);
			if (status !== null) {
				return status;
			}
		}

		return null;
	}

	/**
	 * Extract status from a DOM element
	 * Checks class names, aria-label, title, and other attributes for status indicators
	 */
	extractStatusFromElement(element) {
		const classList = element.classList.toString();
		const ariaLabel = element.getAttribute('aria-label') || '';
		const title = element.getAttribute('title') || '';
		const textContent = element.textContent || '';
		const dataTestId = element.dataset?.testid || '';
		const dataTid = element.dataset?.tid || '';
		
		// Also check for SVG fill colors or specific presence class patterns
		const style = element.getAttribute('style') || '';
		const fill = element.getAttribute('fill') || '';
		
		// Check child elements for presence indicators (often nested SVGs or spans)
		let childPresenceInfo = '';
		const presenceChild = element.querySelector('[class*="presence"], [data-tid*="presence"]');
		if (presenceChild) {
			childPresenceInfo = presenceChild.classList.toString() + ' ' + 
							   (presenceChild.getAttribute('aria-label') || '');
		}

		return this.mapTextToStatusCode(classList, ariaLabel, title, textContent, dataTestId, dataTid, style, fill, childPresenceInfo);
	}

	/**
	 * Extract status from page title
	 */
	extractStatusFromPageTitle() {
		return this.mapTextToStatusCode(document.title);
	}

	/**
	 * Map UI text/attributes to status code using keyword lookup
	 * Checks keywords in priority order (most specific first)
	 */
	mapTextToStatusCode(...textSources) {
		const combinedText = textSources.join(' ').toLowerCase();

		// Check each status keyword group in priority order
		for (const statusGroup of this.statusKeywords) {
			for (const keyword of statusGroup.keywords) {
				if (combinedText.includes(keyword)) {
					return statusGroup.code;
				}
			}
		}

		return null;
	}

	/**
	 * Stop monitoring
	 */
	stop() {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}

		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		console.debug('MQTT status monitoring stopped');
	}
}

module.exports = new MQTTStatusMonitor();

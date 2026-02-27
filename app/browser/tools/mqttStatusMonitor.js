/**
 * MQTT Status Monitor
 *
 * Monitors Teams user status and sends updates to the main process via IPC
 * for MQTT publishing to home automation systems.
 *
 * Status Detection Strategy:
 * 1. Try React internals first (most reliable)
 * 2. Uses MutationObserver for real-time DOM changes (debounced)
 * 3. Polls periodically as fallback (configurable interval)
 * 4. Checks multiple selectors and strategies for robustness
 *
 * Status Codes:
 * 1 = Available, 2 = Busy, 3 = Do Not Disturb, 4 = Away, 5 = Be Right Back
 */
const ReactHandler = require('./reactHandler');

class MQTTStatusMonitor {
	init(config, ipcRenderer) {
		this.config = config;
		this.ipcRenderer = ipcRenderer;
		this.lastStatus = null;
		this.observer = null;
		this.pollInterval = null;
		this.debounceTimer = null;
		this._loggedCoreServices = false;
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
	 * Uses multiple strategies for robustness
	 *
	 * @returns {number|null} Status code (1-5) or null if not detected
	 */
	detectCurrentStatus() {
		// Strategy 0: Try React internals first (most reliable)
		let status = this.detectStatusFromReact();
		if (status !== null) {
			if (!this._loggedDetection) console.info('[MQTT Status Diag] Detected via React internals:', status);
			this._loggedDetection = true;
			return status;
		}

		// Log available core services for debugging (once)
		this._logCoreServicesOnce();

		// Strategy 1: Try CSS selectors for direct presence indicators
		status = this.detectStatusFromSelectors();
		if (status !== null) {
			if (!this._loggedDetection) console.info('[MQTT Status Diag] Detected via CSS selectors:', status);
			this._loggedDetection = true;
			return status;
		}

		// Strategy 2: Check me-control button for presence indicator
		status = this.detectStatusFromMeControl();
		if (status !== null) {
			if (!this._loggedDetection) console.info('[MQTT Status Diag] Detected via me-control:', status);
			this._loggedDetection = true;
			return status;
		}

		// Strategy 3: Check page title (unlikely but kept for compatibility)
		status = this.extractStatusFromPageTitle();
		if (status !== null) {
			if (!this._loggedDetection) console.info('[MQTT Status Diag] Detected via page title:', status);
			this._loggedDetection = true;
			return status;
		}

		return null;
	}

	/**
	 * Log available core services once for debugging
	 * Enhanced: also logs sub-keys of presence-related services
	 */
	_logCoreServicesOnce() {
		if (this._loggedCoreServices) {
			return;
		}
		const serviceKeys = ReactHandler.getCoreServiceKeys();
		if (serviceKeys) {
			console.info('[MQTT Status Diag] Available core services:', JSON.stringify(serviceKeys));

			// Dump sub-keys of any service containing "presence", "status", or "client"
			const interestingPatterns = ['presence', 'status', 'client', 'user'];
			for (const key of serviceKeys) {
				const lowerKey = key.toLowerCase();
				if (interestingPatterns.some(p => lowerKey.includes(p))) {
					try {
						const service = ReactHandler.getCoreService(key);
						if (service && typeof service === 'object') {
							const subKeys = Object.keys(service).slice(0, 30);
							console.info(`[MQTT Status Diag] Service "${key}" keys:`, JSON.stringify(subKeys));
						}
					} catch {
						// ignore
					}
				}
			}
			this._loggedCoreServices = true;
		}
	}

	/**
	 * Detect status from CSS selectors
	 * @returns {number|null} Status code or null if not detected
	 */
	detectStatusFromSelectors() {
		const selectors = [
			// Teams v2 specific selectors
			'[data-tid="me-control-presence-icon"]',
			'[data-tid="presence-indicator"]',
			// General presence selectors
			'[data-testid="presence-status"]',
			'[data-tid="my-status-button"]',
			'.ts-presence',
			'.presence-button',
			'button[class*="presence"]',
			'div[class*="presence"]',
			// Broad wildcard selectors (restored from v2.6.18)
			'[aria-label*="status"]',
			'[title*="status"]'
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
	 * Detect status from me-control button
	 * @returns {number|null} Status code or null if not detected
	 */
	detectStatusFromMeControl() {
		const meControl = document.querySelector('[data-tid="me-control-button"]');
		if (!meControl) {
			return null;
		}

		// Look for presence indicator within the me-control
		const presenceIndicator = meControl.querySelector('[class*="presence"]') ||
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
	 * Detect status from React internals
	 * This is more reliable than DOM scraping as it accesses Teams' internal state
	 *
	 * @returns {number|null} Status code (1-5) or null if not detected
	 */
	detectStatusFromReact() {
		try {
			const presence = ReactHandler.getUserPresence();
			if (!presence) {
				return null;
			}

			// Map presence object to status code
			// Teams uses various formats, try to handle them all
			const presenceStatus = presence.availability || 
								   presence.status || 
								   presence.presenceStatus ||
								   presence;

			if (typeof presenceStatus === 'number') {
				// Direct numeric status
				if (presenceStatus >= 1 && presenceStatus <= 5) {
					return presenceStatus;
				}
			}

			if (typeof presenceStatus === 'string') {
				// Map string status to numeric code
				const statusText = presenceStatus.toLowerCase();
				return this.mapTextToStatusCode(statusText);
			}

			return null;
		} catch {
			return null;
		}
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
	 * Scan entire document for status keywords
	 */
	scanForStatusText() {
		return this.mapTextToStatusCode(document.body.textContent);
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

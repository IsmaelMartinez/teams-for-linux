/**
 * MQTT Status Monitor
 *
 * Monitors Teams user status and sends updates to the main process via IPC
 * for MQTT publishing to home automation systems.
 *
 * Status Detection Strategy:
 * 1. Uses MutationObserver for real-time DOM changes (debounced)
 * 2. Polls periodically as fallback (configurable interval)
 * 3. Checks multiple selectors and strategies for robustness
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
		let status = null;

		// Strategy 1: Try multiple CSS selectors
		const selectors = [
			'[data-testid="presence-status"]',
			'[data-tid="my-status-button"]',
			'[aria-label*="status"]',
			'[title*="status"]',
			'.ts-presence',
			'.presence-button',
			'button[class*="presence"]',
			'div[class*="presence"]'
		];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element) {
				status = this.extractStatusFromElement(element);
				if (status !== null) {
					console.debug(`Status found using selector: ${selector}`);
					return status;
				}
			}
		}

		// Strategy 2: Check page title
		status = this.extractStatusFromPageTitle();
		if (status !== null) {
			return status;
		}

		// Strategy 3: Scan for status text in DOM
		status = this.scanForStatusText();
		if (status !== null) {
			return status;
		}

		return null;
	}

	/**
	 * Extract status from a DOM element
	 */
	extractStatusFromElement(element) {
		const classList = element.classList.toString();
		const ariaLabel = element.getAttribute('aria-label') || '';
		const title = element.getAttribute('title') || '';
		const textContent = element.textContent || '';
		const dataTestId = element.dataset.testid || '';

		return this.mapTextToStatusCode(classList, ariaLabel, title, textContent, dataTestId);
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

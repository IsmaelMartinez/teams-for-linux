/**
 * MQTT Status Monitor
 *
 * Monitors Teams user status and sends updates to the main process via IPC
 * for MQTT publishing to home automation systems.
 *
 * Status Detection Strategy:
 * 1. Uses MutationObserver for real-time DOM changes
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
	 */
	setupMutationObserver() {
		this.observer = new MutationObserver(() => {
			this.checkStatusChange();
		});

		// Observe the entire body for changes to status-related attributes
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'aria-label', 'title', 'data-testid']
		});

		console.debug('Mutation observer set up for status monitoring');
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
			'[title*="status" i]',
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
		const dataTestId = element.getAttribute('data-testid') || '';

		return this.mapTextToStatusCode(classList, ariaLabel, title, textContent, dataTestId);
	}

	/**
	 * Extract status from page title
	 */
	extractStatusFromPageTitle() {
		const title = document.title.toLowerCase();

		if (title.includes('busy') || title.includes('in a call')) return 2;
		if (title.includes('do not disturb') || title.includes('dnd')) return 3;
		if (title.includes('away')) return 4;
		if (title.includes('be right back') || title.includes('brb')) return 5;
		if (title.includes('available')) return 1;

		return null;
	}

	/**
	 * Scan entire document for status keywords
	 */
	scanForStatusText() {
		const bodyText = document.body.textContent.toLowerCase();

		// Check in priority order (most specific first)
		if (bodyText.includes('do not disturb') || bodyText.includes('dnd')) return 3;
		if (bodyText.includes('be right back') || bodyText.includes('brb')) return 5;
		if (bodyText.includes('busy') || bodyText.includes('in a call') || bodyText.includes('in a meeting')) return 2;
		if (bodyText.includes('away')) return 4;
		if (bodyText.includes('available')) return 1;

		return null;
	}

	/**
	 * Map UI text/attributes to status code
	 */
	mapTextToStatusCode(...textSources) {
		const combinedText = textSources.join(' ').toLowerCase();

		// Check for status indicators in priority order
		if (combinedText.includes('do not disturb') ||
		    combinedText.includes('dnd') ||
		    combinedText.includes('do-not-disturb') ||
		    combinedText.includes('focus')) {
			return 3; // Do Not Disturb
		}

		if (combinedText.includes('be right back') ||
		    combinedText.includes('brb') ||
		    combinedText.includes('berightback')) {
			return 5; // Be Right Back
		}

		if (combinedText.includes('busy') ||
		    combinedText.includes('in a call') ||
		    combinedText.includes('in a meeting') ||
		    combinedText.includes('red')) {
			return 2; // Busy
		}

		if (combinedText.includes('away') ||
		    combinedText.includes('inactive') ||
		    combinedText.includes('yellow')) {
			return 4; // Away
		}

		if (combinedText.includes('available') ||
		    combinedText.includes('online') ||
		    combinedText.includes('green')) {
			return 1; // Available
		}

		// Check for CSS class-based presence indicators
		if (combinedText.includes('presence-available') || combinedText.includes('status-available')) return 1;
		if (combinedText.includes('presence-busy') || combinedText.includes('status-busy')) return 2;
		if (combinedText.includes('presence-dnd') || combinedText.includes('status-dnd')) return 3;
		if (combinedText.includes('presence-away') || combinedText.includes('status-away')) return 4;
		if (combinedText.includes('presence-berightback') || combinedText.includes('status-brb')) return 5;

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

		console.debug('MQTT status monitoring stopped');
	}
}

module.exports = new MQTTStatusMonitor();

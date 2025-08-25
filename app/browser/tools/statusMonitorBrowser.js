// Browser-compatible status monitor for Teams MQTT integration
// This version doesn't use Node.js modules and is designed to run in the browser context

let lastStatus = null;
let observer = null;

const StatusMonitor = {
    config: null,
    ipcRenderer: null,

    init(config, ipcRenderer) {
        console.log("=== INITIALIZING STATUS MONITOR ===");
        this.config = config;
        this.ipcRenderer = ipcRenderer;
        this.start();
    },

    start() {
        console.log('=== STARTING TEAMS STATUS MONITOR ===');
        console.debug('Starting Teams status monitor...');
        
        // Wait for DOM to be ready
        const startMonitoring = () => {
            this.setupMutationObserver();
            this.startPolling();
            console.log('=== TEAMS STATUS MONITOR ACTIVE ===');
            console.debug('Teams status monitor active');
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startMonitoring);
        } else {
            // DOM is already ready
            setTimeout(startMonitoring, 3000); // Give Teams time to load
        }
    },

    setupMutationObserver() {
        // Create mutation observer to watch for DOM changes
        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' || mutation.type === 'childList') {
                    this.checkStatusChange();
                }
            });
        });

        // Start observing the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-label', 'title', 'data-testid']
        });
    },

    startPolling() {
        // Also poll every 5 seconds as fallback
        setInterval(() => {
            this.checkStatusChange();
        }, 5000);
    },

    checkStatusChange() {
        try {
            let status = null;

            // Method 1: Try multiple selectors for status elements
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
                        break;
                    }
                }
            }

            // Method 2: Try to find status in page title or meta
            if (status === null) {
                status = this.extractStatusFromPageMeta();
            }

            // Method 3: Look for status indicators in any element containing status text
            if (status === null) {
                status = this.scanForStatusIndicators();
            }

            if (status !== null && status !== lastStatus) {
                console.log(`=== TEAMS STATUS CHANGED: ${lastStatus} -> ${status} ===`);
                console.debug(`Teams status changed from ${lastStatus} to ${status}`);
                lastStatus = status;
                
                // Send status change to main process
                this.ipcRenderer.invoke('user-status-changed', {
                    data: { status: status }
                });
            }
        } catch (error) {
            console.debug('Status monitor error:', error);
        }
    },

    extractStatusFromElement(element) {
        const classList = element.classList.toString();
        const ariaLabel = element.getAttribute('aria-label') || '';
        const title = element.getAttribute('title') || '';
        const textContent = element.textContent || '';
        const dataTestId = element.getAttribute('data-testid') || '';

        return this.mapUIStatusToCode(classList, ariaLabel, title, textContent, dataTestId);
    },

    extractStatusFromPageMeta() {
        // Check page title for status information
        const title = document.title.toLowerCase();
        if (title.includes('busy') || title.includes('in a call')) return 2;
        if (title.includes('away')) return 4;
        if (title.includes('available')) return 1;
        
        return null;
    },

    scanForStatusIndicators() {
        // Look for any element containing status-related text
        const statusTexts = ['available', 'busy', 'away', 'do not disturb', 'be right back'];
        
        for (const statusText of statusTexts) {
            const xpath = `//text()[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${statusText}')]/..`;
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            
            if (result.singleNodeValue) {
                const status = this.mapUIStatusToCode('', '', '', statusText, '');
                if (status !== null) {
                    console.debug(`Status found via text scan: ${statusText}`);
                    return status;
                }
            }
        }
        
        return null;
    },

    mapUIStatusToCode(classList, ariaLabel, title, textContent, dataTestId) {
        const combinedText = (classList + ' ' + ariaLabel + ' ' + title + ' ' + textContent + ' ' + dataTestId).toLowerCase();

        // Map Teams UI indicators to status codes
        if (combinedText.includes('available') || combinedText.includes('online') || combinedText.includes('green')) {
            return 1; // Available
        }
        if (combinedText.includes('busy') || combinedText.includes('in a call') || combinedText.includes('in a meeting') || combinedText.includes('red')) {
            return 2; // Busy
        }
        if (combinedText.includes('do not disturb') || combinedText.includes('dnd') || combinedText.includes('do-not-disturb') || combinedText.includes('focus')) {
            return 3; // Do Not Disturb
        }
        if (combinedText.includes('away') || combinedText.includes('inactive') || combinedText.includes('yellow')) {
            return 4; // Away
        }
        if (combinedText.includes('be right back') || combinedText.includes('brb')) {
            return 5; // Be Right Back
        }

        // Fallback: try to detect from presence indicators
        if (combinedText.includes('presence-available') || combinedText.includes('status-available')) return 1;
        if (combinedText.includes('presence-busy') || combinedText.includes('status-busy')) return 2;
        if (combinedText.includes('presence-dnd') || combinedText.includes('status-dnd')) return 3;
        if (combinedText.includes('presence-away') || combinedText.includes('status-away')) return 4;
        if (combinedText.includes('presence-berightback') || combinedText.includes('status-brb')) return 5;

        return null; // Unknown or unchanged
    },

    stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }
};
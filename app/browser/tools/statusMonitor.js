/**
 * Status Monitor for MQTT Integration
 * 
 * This module provides Teams status detection for MQTT publishing.
 * 
 * Status Detection Flow:
 * 1. Polls Teams UI every 10 seconds for status changes
 * 2. Uses simple text-based detection in document content
 * 3. Triggers IPC event to main process when status changes
 * 4. Main process publishes status to configured MQTT broker
 * 
 * Status Codes:
 * 1 = Available, 2 = Busy, 3 = Do Not Disturb, 4 = Away, 5 = Be Right Back
 */

let lastStatus = null;
let statusCheckInterval = null;

class StatusMonitor {
    init(config, ipcRenderer) {
        this.config = config;
        this.ipcRenderer = ipcRenderer;
        
        // Only start monitoring if MQTT is enabled in config
        if (!config.mqtt?.enabled) {
            return;
        }
        
        console.debug('Starting status monitor for MQTT');
        this.start();
    }

    /**
     * Start the periodic status checking
     * Uses interval-based polling as Teams doesn't expose native status change events
     */
    start() {
        // Poll the status every 10 seconds, could be a configuration option?
	statusCheckInterval = setInterval(() => {
            this.checkStatus();
        }, 10000);
        
        // Perform initial status detection after Teams UI loads
        setTimeout(() => {
            this.checkStatus();
        }, 5000);
    }

    /**
     * Check current Teams status and trigger IPC if changed
     */
    checkStatus() {
        try {
            const status = this.detectCurrentStatus();
            
            // Only send IPC message if status actually changed to avoid spam
            if (status !== null && status !== lastStatus) {
                console.debug(`Teams status changed: ${lastStatus} -> ${status}`);
                lastStatus = status;
                
                // Send status change to main process via IPC
                // Main process handles MQTT publishing through userStatusChangedHandler
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
     * Uses simple text-based scanning of page content
     * 
     * @returns {number|null} Status code (1-5) or null if not detected
     */
    detectCurrentStatus() {
        // Map status text to numeric codes for MQTT publishing
        const statusTexts = [
            { text: 'available', code: 1 },
            { text: 'busy', code: 2 },
            { text: 'do not disturb', code: 3 },
            { text: 'away', code: 4 },
            { text: 'be right back', code: 5 }
        ];

        const pageText = document.body.textContent.toLowerCase();
        
        // Return the first matching status found
        for (const statusObj of statusTexts) {
            if (pageText.includes(statusObj.text)) {
                return statusObj.code;
            }
        }

        return null; // No recognizable status found
    }

    stop() {
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    }
}

module.exports = new StatusMonitor();

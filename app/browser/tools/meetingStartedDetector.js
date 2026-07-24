const DEFAULT_PATTERN = /has started the meeting|meeting started|started meeting/i;
const DEFAULT_DEBOUNCE_MS = 2000;

class MeetingStartedDetector {
    constructor(options = {}) {
        this.onMeetingStarted = options.onMeetingStarted || (() => {});
        this.pattern = options.pattern || DEFAULT_PATTERN;
        this.debounceMs = options.debounceMs || DEFAULT_DEBOUNCE_MS;
        this.lastDetectionTime = 0;
        this.observer = null;
        this.isRunning = false;
    }

    start(root = document) {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.checkForMeetingStarted(node);
                    }
                }
            }
        });

        this.observer.observe(root, {
            childList: true,
            subtree: true,
        });
    }

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.isRunning = false;
    }

    checkForMeetingStarted(element) {
        const text = element.textContent || '';
        if (this.pattern.test(text)) {
            const now = Date.now();
            if (now - this.lastDetectionTime >= this.debounceMs) {
                this.lastDetectionTime = now;
                this.onMeetingStarted({ timestamp: now, text });
            }
        }

        const children = element.querySelectorAll('*');
        for (const child of children) {
            const childText = child.textContent || '';
            if (this.pattern.test(childText)) {
                const now = Date.now();
                if (now - this.lastDetectionTime >= this.debounceMs) {
                    this.lastDetectionTime = now;
                    this.onMeetingStarted({ timestamp: now, text: childText });
                }
            }
        }
    }
}

module.exports = { MeetingStartedDetector };

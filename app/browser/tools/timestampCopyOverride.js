const ReactHandler = require("./reactHandler");

// Bounded retry: stop polling instead of polling forever when Teams never
// exposes the core settings API. 120 consecutive misses (~2 minutes at the
// 1s poll) covers a cold Teams SPA boot on slow hardware.
const MAX_APPLY_ATTEMPTS = 120;

class TimestampCopyOverride {
    overrideInterval = null;
    #applyAttempts = 0;

    init(config) {
        // Idempotent: a second init must not orphan the running timer
        if (this.overrideInterval) return;
        this.config = config;
        this.#applyAttempts = 0;
        this.overrideInterval = setInterval(() => this.applyOverride(), 1000);
    }

    stop() {
        if (this.overrideInterval) {
            clearInterval(this.overrideInterval);
            this.overrideInterval = null;
        }
    }

    applyOverride() {
        try {
            if (this.#tryApplyOverride()) {
                // The cap counts consecutive failures, not lifetime ones
                this.#applyAttempts = 0;
                return;
            }
        } catch (error) {
            // A throwing settings API (e.g. get('compose') returning
            // undefined) is charged against the same attempt budget so it
            // cannot keep throwing out of the interval callback forever.
            console.debug('[TIMESTAMP_COPY] Apply attempt failed:', error?.message ?? String(error));
        }

        this.#applyAttempts += 1;
        if (this.#applyAttempts >= MAX_APPLY_ATTEMPTS) {
            console.warn(`[TIMESTAMP_COPY] Teams core settings never appeared after ${MAX_APPLY_ATTEMPTS} attempts; disableTimestampOnCopy will not apply this session, reload the window to retry.`);
            this.stop();
        }
    }

    // Returns true once the override work ran against a live settings API.
    #tryApplyOverride() {
        const coreServices = ReactHandler._getTeams2CoreServices();
        if (!coreServices?.coreSettings) {
            return false;
        }

        const coreSettings = coreServices.coreSettings;

        if (coreSettings.get('compose').disableTimestampOnCopy === this.config.disableTimestampOnCopy) {
            console.debug('Setting disableTimestampOnCopy is correct, stopping polling');
            this.stop();
        }

        const overrides = {
            disableTimestampOnCopy: this.config.disableTimestampOnCopy
        }

        // Override the get method
        const originalGet = coreSettings.get;
        if (!coreSettings._originalGet) {
            coreSettings._originalGet = originalGet;
            coreSettings.get = function(category) {
                const settings = coreSettings._originalGet.call(this, category);
                if (category === 'compose') {
                    return {
                        ...settings,
                        ...overrides
                    };
                }
                return settings;
            };
        }

        // Override getLatestSettingsForCategory
        const originalGetLatest = coreSettings.getLatestSettingsForCategory;
        if (!coreSettings._originalGetLatest) {
            coreSettings._originalGetLatest = originalGetLatest;
            coreSettings.getLatestSettingsForCategory = function(category) {
                const settings = coreSettings._originalGetLatest.call(this, category);
                if (category === 'compose') {
                    return {
                        ...settings,
                        ...overrides
                    };
                }
                return settings;
            };
        }

        // Override the behavior subject
        const composeSubject = coreSettings.categoryBehaviorSubjectMap.get('compose');
        if (composeSubject && !composeSubject._originalNext) {
            composeSubject._originalNext = composeSubject.next;
            composeSubject.next = function(value) {
                if (value && typeof value === 'object') {
                    value = {
                        ...value,
                        ...overrides
                    };
                }
                return composeSubject._originalNext.call(this, value);
            };
        }

        return true;
    }
}

module.exports = new TimestampCopyOverride();

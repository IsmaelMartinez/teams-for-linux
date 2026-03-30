const ReactHandler = require("./reactHandler");

class TimestampCopyOverride {
    _retryTimer = null;
    _retryCount = 0;
    _maxRetries = 10;

    init(config) {
        this.config = config;
        this._scheduleRetry();
    }

    _scheduleRetry() {
        if (this._retryCount >= this._maxRetries) {
            console.debug('[TIMESTAMP] Max retries reached, giving up');
            return;
        }
        const delay = Math.min(1000 * Math.pow(2, this._retryCount), 30000);
        this._retryTimer = setTimeout(() => {
            this._retryCount++;
            if (!this.applyOverride()) {
                this._scheduleRetry();
            }
        }, delay);
    }

    stop() {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
    }

    applyOverride() {
        const coreServices = ReactHandler._getTeams2CoreServices();
        if (!coreServices?.coreSettings) return false;

        const coreSettings = coreServices.coreSettings;

        if (coreSettings.get('compose').disableTimestampOnCopy === this.config.disableTimestampOnCopy) {
            console.debug('Setting disableTimestampOnCopy is correct, stopping polling');
            return true;
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

import ReactHandler from "./reactHandler.js";

class TimestampCopyOverride {
	overrideInterval = null;

	init(config) {
		this.config = config;
		this.overrideInterval = setInterval(() => this.applyOverride(), 1000);
	}

	stop() {
		if (this.overrideInterval) {
			clearInterval(this.overrideInterval);
			this.overrideInterval = null;
		}
	}

	applyOverride() {
		const coreServices = ReactHandler._getTeams2CoreServices();
		if (!coreServices?.coreSettings) return;

		const coreSettings = coreServices.coreSettings;

		if (coreSettings.get('compose').disableTimestampOnCopy === this.config.disableTimestampOnCopy) {
			console.log('Setting disableTimestampOnCopy is correct, stopping polling');
			this.stop();
		}

		const overrides = {
			disableTimestampOnCopy: this.config.disableTimestampOnCopy
		};

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
	}
}

export default new TimestampCopyOverride();

class Instance {
	/**
	 * @returns {Promise<{controller:object,injector:object}>}
	 */
	async whenReady(tries = 0) {
		if (tries >= 5) {
			throw new Error('Failed to get app objects after 5 tries');
		}
		
		const obj = getAppObjects();
		if (obj) {
			return obj;
		} else {
			await sleep(4000);
			return await this.whenReady(tries + 1);
		}
	}

	getTeams2ReactElement() {
		return document.getElementById('app');
	}

	getTeams2CoreServices() {
		return this.getTeams2ReactElement()?._reactRootContainer?._internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
	}

	getTeams2IdleTracker() {
		return this.getTeams2CoreServices()?.clientState?._idleTracker;
	}
}

function getAppObjects() {
	if (typeof window.angular == 'undefined') {
		return null;
	}

	return {
		controller: window.angular.element(document.documentElement).controller(),
		injector: window.angular.element(document.documentElement).injector()
	};
}

async function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

module.exports = new Instance();


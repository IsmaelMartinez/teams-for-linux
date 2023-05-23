class Instance {
	/**
	 * @returns {Promise<{controller:object,injector:object}>}
	 */
	async whenReady() {
		const obj = getAppObjects();
		if (obj) {
			return obj;
		} else {
			await sleep(4000);
			return await this.whenReady();
		}
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


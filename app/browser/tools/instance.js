class Instance {
	/**
	 * @param {(controller)=>void} callback
	 */
	whenControllerReady(callback) {
		const controller = typeof window.angular !== 'undefined' ? window.angular.element(document.documentElement).controller() : null;
		if (controller) {
			callback(controller);
		} else {
			setTimeout(() => this.whenControllerReady(callback), 4000);
		}
	}

	/**
	 * @returns {Promise<object>}
	 */
	async whenControllerReadyAsync() {
		const controller = getController();
		if (controller) {
			return controller;
		} else {
			await sleep(4000);
			return await this.whenControllerReadyAsync();
		}
	}
}

function getController() {
	return typeof window.angular !== 'undefined' ? window.angular.element(document.documentElement).controller() : null;
}

async function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

module.exports = new Instance();


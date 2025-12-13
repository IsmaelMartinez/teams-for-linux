/**
 * ActivityHub tool
 * 
 * Monitors Teams activity hub for notifications.
 */
class ActivityHub {
	init(config) {
		this.config = config;
		console.debug("[ActivityHub] Initialized");
	}
}

export default new ActivityHub();

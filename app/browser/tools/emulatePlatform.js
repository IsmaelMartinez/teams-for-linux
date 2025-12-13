/**
 * EmulatePlatform tool
 * 
 * Emulates Windows platform for compatibility with certain MFA apps.
 */
class EmulatePlatform {
	init(config) {
		this.config = config;

		if (config.emulateWinChromiumPlatform) {
			this.emulateWindows();
		}
	}

	/**
	 * Emulate Windows platform
	 */
	emulateWindows() {
		// Override navigator.platform
		Object.defineProperty(navigator, "platform", {
			get: () => "Win32",
			configurable: true,
		});

		// Override navigator.userAgentData if available
		if (navigator.userAgentData) {
			Object.defineProperty(navigator.userAgentData, "platform", {
				get: () => "Windows",
				configurable: true,
			});
		}

		console.debug("[EmulatePlatform] Emulating Windows platform");
	}
}

export default new EmulatePlatform();

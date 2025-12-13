/**
 * DisableAutogain tool
 * 
 * Disables automatic microphone gain control.
 */
class DisableAutogain {
	init(config) {
		this.config = config;

		if (config.disableAutogain) {
			this.disableAutogain();
		}
	}

	/**
	 * Disable automatic gain control on media streams
	 */
	disableAutogain() {
		// Override getUserMedia to disable auto gain
		const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

		navigator.mediaDevices.getUserMedia = async (constraints) => {
			// Add autoGainControl: false to audio constraints
			if (constraints?.audio) {
				if (typeof constraints.audio === "boolean") {
					constraints.audio = {
						autoGainControl: false,
						echoCancellation: true,
						noiseSuppression: true,
					};
				} else {
					constraints.audio.autoGainControl = false;
				}
			}

			return originalGetUserMedia(constraints);
		};

		console.debug("[DisableAutogain] Automatic gain control disabled");
	}
}

export default new DisableAutogain();

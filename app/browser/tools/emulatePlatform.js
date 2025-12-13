class PlatformEmulator {
	init(config) {
		//proceed without emulating windows platform in browser
		if (!config.emulateWinChromiumPlatform) {
			return;
		}

		// update property platform property in navigator.navigator
		const win32Str = "Win32";
		const windowsStr = "Windows";
		Object.defineProperty(Navigator.prototype, "platform", {
			get: () => {
				return win32Str;
			},
		});

		//update userAgentData object
		const originalUserAgentData = navigator.userAgentData;
		let customUserAgentData = structuredClone(originalUserAgentData);
		customUserAgentData = {
			...customUserAgentData,
			platform: windowsStr,
			getHighEntropyValues: async function (input) {
				const highEntropyValue =
					await originalUserAgentData.getHighEntropyValues(input);
				if (highEntropyValue["platform"]) {
					highEntropyValue["platform"] = windowsStr;
				}
				return highEntropyValue;
			},
		};
		Object.defineProperty(Navigator.prototype, "userAgentData", {
			get: () => {
				return customUserAgentData;
			},
		});
	}
}

export default new PlatformEmulator();

class PlatformEmulator {
    init(config) {
        //proceed without emulating windows platform in browser
        if (!config.emulateWinChromiumPlatform) {
            return
        }

        // update property platform property in navigator.navigator
        const win32Str = "Win32"
        const windowsStr = "Windows"
        Object.defineProperty(Navigator.prototype, "platform", { get: () => { return win32Str } })


        //update userAgentData object
        let originalUserAgentData = navigator.userAgentData
        let customUserAgentData = JSON.parse(JSON.stringify(originalUserAgentData))
        customUserAgentData = {
            ...customUserAgentData,
            platform: windowsStr,
            getHighEntropyValues: async function (input) {
                let highEntropyValue = await originalUserAgentData.getHighEntropyValues(input)
                if (highEntropyValue['platform']) {
                    highEntropyValue['platform'] = windowsStr
                }
                return highEntropyValue
            }
        }
        Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => { return customUserAgentData } })


    }
}

module.exports = new PlatformEmulator;
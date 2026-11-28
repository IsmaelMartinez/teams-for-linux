/**
 * Build the resolved media topic map from mqtt config, applying defaults.
 *
 * @param {object} mqttConfig - The config.mqtt object
 * @returns {{ inCall: string, incomingCall: string, incomingCallCaller: string, meetingStarted: string, camera: string, microphone: string, microphoneControl: string, screenSharing: string }}
 */
function getMediaTopics(mqttConfig) {
	// The fallbacks here only apply when `mediaTopics` is used without the
	// config defaults. Config loading deep-merges the mqtt option's defaults
	// into the user's mediaTopics, and a literal default there always wins over
	// a fallback. microphoneControl has one ("microphone/control"), so it does
	// NOT follow a renamed `microphone`: rename both to move both.
	// incomingCallCaller has no entry in the option's defaults on purpose, so it
	// does follow `incomingCall` ("<incomingCall>/caller").
	const microphone = mqttConfig.mediaTopics?.microphone || 'microphone';
	const incomingCall = mqttConfig.mediaTopics?.incomingCall || 'incoming-call';
	return {
		inCall: mqttConfig.mediaTopics?.inCall || 'in-call',
		incomingCall,
		incomingCallCaller: mqttConfig.mediaTopics?.incomingCallCaller || `${incomingCall}/caller`,
		meetingStarted: mqttConfig.mediaTopics?.meetingStarted || 'meeting-started',
		camera: mqttConfig.mediaTopics?.camera || 'camera',
		microphone,
		microphoneControl: mqttConfig.mediaTopics?.microphoneControl || `${microphone}/control`,
		screenSharing: mqttConfig.mediaTopics?.screenSharing || 'screen-sharing',
	};
}

module.exports = { getMediaTopics };

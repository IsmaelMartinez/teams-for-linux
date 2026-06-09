/**
 * Build the resolved media topic map from mqtt config, applying defaults.
 *
 * @param {object} mqttConfig - The config.mqtt object
 * @returns {{ inCall: string, incomingCall: string, camera: string, microphone: string, microphoneControl: string, screenSharing: string }}
 */
function getMediaTopics(mqttConfig) {
	// microphoneControl defaults to "<microphone>/control" so that customising
	// `microphone` alone keeps the control topic in sync (e.g. microphone "mic"
	// → control "mic/control"). Set microphoneControl explicitly to decouple it.
	const microphone = mqttConfig.mediaTopics?.microphone || 'microphone';
	return {
		inCall: mqttConfig.mediaTopics?.inCall || 'in-call',
		incomingCall: mqttConfig.mediaTopics?.incomingCall || 'incoming-call',
		camera: mqttConfig.mediaTopics?.camera || 'camera',
		microphone,
		microphoneControl: mqttConfig.mediaTopics?.microphoneControl || `${microphone}/control`,
		screenSharing: mqttConfig.mediaTopics?.screenSharing || 'screen-sharing',
	};
}

module.exports = { getMediaTopics };

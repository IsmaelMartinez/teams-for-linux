/**
 * Build the resolved media topic map from mqtt config, applying defaults.
 *
 * @param {object} mqttConfig - The config.mqtt object
 * @returns {{ inCall: string, incomingCall: string, camera: string, microphone: string, microphoneControl: string, screenSharing: string }}
 */
function getMediaTopics(mqttConfig) {
	return {
		inCall: mqttConfig.mediaTopics?.inCall || 'in-call',
		incomingCall: mqttConfig.mediaTopics?.incomingCall || 'incoming-call',
		camera: mqttConfig.mediaTopics?.camera || 'camera',
		microphone: mqttConfig.mediaTopics?.microphone || 'microphone',
		microphoneControl: mqttConfig.mediaTopics?.microphoneControl || 'microphone/control',
		screenSharing: mqttConfig.mediaTopics?.screenSharing || 'screen-sharing',
	};
}

module.exports = { getMediaTopics };

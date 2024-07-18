const { ipcRenderer } = require('electron');
const disableAutogain = require('./disableAutogain');
// In order to have this functionality working, contextIsolation should be disabled.
// In new versions of electron, contextIsolation is set to true by default.
// We should explicitly set it to false when creating BrowserWindow

let _getDisplayMedia;

function init(config) {
	window.addEventListener('DOMContentLoaded', () => {
		if (process.env.XDG_SESSION_TYPE === 'wayland') {
			_getDisplayMedia = MediaDevices.prototype.getDisplayMedia;
			MediaDevices.prototype.getDisplayMedia = customGetDisplayMediaWayland;
		} else {
			MediaDevices.prototype.getDisplayMedia = customGetDisplayMediaX11;
		}

		if (config.disableAutogain) {
			disableAutogain();
		}
	});
}

async function customGetDisplayMediaWayland(...args) {
	args[0].audio = false;
	args[0].systemAudio = 'exclude';

	return await _getDisplayMedia.apply(navigator.mediaDevices, args);
}

function customGetDisplayMediaX11() {
	return new Promise((resolve, reject) => {
		// Request main process to allow access to screen sharing
		ipcRenderer.once('select-source', (_event, source) => {
			startStreaming({ source, resolve, reject });
		});
		ipcRenderer.send('select-source');
	});
}

function startStreaming(properties) {
	if (properties.source) {
		navigator.mediaDevices.getUserMedia({
			audio: false,
			video: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: properties.source.id,
					minWidth: properties.source.screen.width,
					maxWidth: properties.source.screen.width,
					minHeight: properties.source.screen.height,
					maxHeight: properties.source.screen.height
				}
			}
		}).then(stream => {
			properties.resolve(stream);
		}).catch(e => {
			console.error(e.message);
			properties.reject(e.message);
		});
	} else {
		properties.reject('Access denied');
	}
}

module.exports = init;
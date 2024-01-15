const { ipcRenderer } = require('electron');
const disableAutogain = require('./disableAutogain');
// In order to have this functionality working, contextIsolation should be disabled.
// In new versions of electron, contextIsolation is set to true by default.
// We should explicitly set it to false when creating BrowserWindow

function init(config) {
	window.addEventListener('DOMContentLoaded', () => {
		if (process.env.XDG_SESSION_TYPE === 'wayland') {
			ipcRenderer.once('get-screensizes-response', (event, screens) => {
				customGetDisplayMediaWayland(screens);
			});
			ipcRenderer.send('get-screensizes-request');
		} else {
			MediaDevices.prototype.getDisplayMedia = customGetDisplayMediaX11;
		}

		if (config.disableAutogain) {
			disableAutogain();
		}
	});
}

function customGetDisplayMediaWayland(screens) {
	ipcRenderer.invoke('desktopCapturerGetSources', { types: ['window', 'screen'] }).then(async (sources) => {
		if (sources.length === 0)
			return;

		const properties = {
			id: sources[0].id,
			screen: screens.find(s => s.default)
		};
		ipcRenderer.send('selected-source', properties);
	});
}

function customGetDisplayMediaX11() {
	return new Promise((resolve, reject) => {
		// Request main process to allow access to screen sharing
		ipcRenderer.once('select-source', (event, source) => {
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
			console.log(e.message);
			properties.reject(e.message);
		});
	} else {
		properties.reject('Access denied');
	}
}

module.exports = init;
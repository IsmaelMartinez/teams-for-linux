const { webFrame, ipcRenderer } = require('electron');

const zoomLevels = {
	'+': 1,
	'-': -1,
	'0': 0
};

exports = module.exports = (config) => {
	restoreZoomLevel(config);
	document.addEventListener('keydown', (event) => {
		const keyName = event.key;

		if (keyName === 'Control') {
			// do not alert when only the Control key is being pressed.
			return;
		}

		if (event.ctrlKey) {
			setNextZoomLevel(keyName, config);
		}
	}, false);
};

function restoreZoomLevel(config) {
	ipcRenderer.invoke('getZoomLevel', config.partition).then(zoomLevel => {
		webFrame.setZoomLevel(zoomLevel);
	});
}

function setNextZoomLevel(keyName, config) {
	const zoomFactor = zoomLevels[keyName];
	var zoomLevel = webFrame.getZoomLevel();
	console.log(`Current zoom level: ${zoomLevel}`);
	if (typeof (zoomFactor) !== 'number') {
		return;
	}

	zoomLevel = zoomFactor == 0 ? 0 : zoomLevel + zoomFactor;
	webFrame.setZoomLevel(zoomLevel);
	ipcRenderer.invoke('saveZoomLevel', {
		partition: config.partition,
		zoomLevel: webFrame.getZoomLevel()
	});
}
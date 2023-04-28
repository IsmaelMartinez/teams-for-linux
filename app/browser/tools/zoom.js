const { webFrame, ipcRenderer } = require('electron');
const { LucidLog } = require('lucid-log');
const logger = new LucidLog({
	levels: ['debug']
});

const zoomLevels = {
	'+': 0.25,
	'-': -0.25,
	'0': 0
};

let _Zoom_config = new WeakMap();
let _Zoom_initialized = new WeakMap();
class Zoom {
	constructor() {
		_Zoom_initialized.set(this, false);
	}
	init(config) {
		if (this.initialized) {
			return;
		}

		_Zoom_config.set(this, config);
		_Zoom_initialized.set(this, true);
		this.restoreZoomLevel();
		require('@electron/remote').getCurrentWindow().webContents.on('zoom-changed', setZoomChangedHandler(config));
	}

	get config() {
		return _Zoom_config.get(this);
	}

	get initialized() {
		return _Zoom_initialized.get(this);
	}

	restoreZoomLevel() {
		restoreZoomLevelInternal(this.config);
	}

	resetZoomLevel() {
		setNextZoomLevel('0', this.config);
	}

	increaseZoomLevel() {
		setNextZoomLevel('+', this.config);
	}

	decreaseZoomLevel() {
		setNextZoomLevel('-', this.config);
	}
}

function setZoomChangedHandler(config) {
	return (event, zoomDirection) => {
		setNextZoomLevel(zoomDirection == 'in' ? '+' : '-', config);
	};
}

function restoreZoomLevelInternal(config) {
	ipcRenderer.invoke('getZoomLevel', config.partition).then(zoomLevel => {
		webFrame.setZoomLevel(zoomLevel);
	});
}

function setNextZoomLevel(keyName, config) {
	const zoomFactor = zoomLevels[keyName];
	var zoomLevel = webFrame.getZoomLevel();
	logger.debug(`Current zoom level: ${zoomLevel}`);
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

exports = module.exports = new Zoom();
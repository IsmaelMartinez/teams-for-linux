const { webFrame, ipcRenderer } = require('electron');
const { LucidLog } = require('lucid-log');
const logger = new LucidLog({
	levels: ['debug']
});

//zoomFactor can be configurable
const zoomFactor = 0.25;
const zoomMin = -7.5; //-7.5 * 20% = -150% or 50% of original
const zoomMax = 7.5; // 7.5 * 20% = +200% or 300% of original
const zoomOffsets = {
	'+': 1,
	'-': -1,
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

function restoreZoomLevelInternal(config) {
	ipcRenderer.invoke('getZoomLevel', config.partition).then(zoomLevel => {
		webFrame.setZoomLevel(zoomLevel);
	});
}

function setNextZoomLevel(keyName, config) {
	const zoomOffset = zoomOffsets[keyName];
	let zoomLevel = webFrame.getZoomLevel();
	logger.debug(`Current zoom level: ${zoomLevel}`);
	if (typeof (zoomOffset) !== 'number') {
		return;
	}

	zoomLevel = zoomOffset === 0 ? 0 : zoomLevel + zoomOffset * zoomFactor;
	if (zoomLevel < zoomMin || zoomLevel > zoomMax) return;
	webFrame.setZoomLevel(zoomLevel);
	ipcRenderer.invoke('saveZoomLevel', {
		partition: config.partition,
		zoomLevel: webFrame.getZoomLevel()
	});
}

exports = module.exports = new Zoom();

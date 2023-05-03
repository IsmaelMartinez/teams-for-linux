
const zoom = require('./zoom');

let _Shortcuts_config = new WeakMap();
let _Shortcuts_initialized = new WeakMap();
class Shortcuts {
	constructor() {
		_Shortcuts_initialized.set(this, false);
	}
	init(config) {
		if (this.initialized) {
			return;
		}
		_Shortcuts_config.set(this, config);
		_Shortcuts_initialized.set(this, true);
		initInternal();
	}

	get config() {
		return _Shortcuts_config.get(this);
	}

	get initialized() {
		return _Shortcuts_initialized.get(this);
	}
}

const KEY_MAPS = {
	'CTRL_+': () => zoom.increaseZoomLevel(),
	'CTRL_-': () => zoom.decreaseZoomLevel(),
	'CTRL_0': () => zoom.resetZoomLevel(),
	'ALT_ArrowLeft': () => window.history.back(),
	'ALT_ArrowRight': () => window.history.forward()
};

function initInternal() {
	document.addEventListener('DOMContentLoaded', async () => {
		window.addEventListener('keydown', keyDownEventHandler, false);
		whenIframeReady((iframe) => {
			iframe.contentDocument.addEventListener('keydown', keyDownEventHandler, false);
		});
	});
}

/**
 * @param {(iframe:HTMLIFrameElement)=> void} callback 
 */
function whenIframeReady(callback) {
	const iframe = window.document.getElementsByTagName('iframe')[0];
	if (iframe) {
		callback(iframe);
	} else {
		setTimeout(() => whenIframeReady(callback), 4000);
	}
}

function keyDownEventHandler(event) {
	const keyName = event.key;
	if (keyName === 'Control' || keyName === 'Alt') {
		return;
	}

	fireEvent(getKeyName(event, keyName));
}

function getKeyName(event, keyName) {
	return `${event.ctrlKey ? 'CTRL_' : ''}${event.altKey ? 'ALT_' : ''}${keyName}`;
}

function fireEvent(key) {
	const event = KEY_MAPS[key];
	if (typeof (event) === 'function') {
		event();
	}
}

module.exports = new Shortcuts();
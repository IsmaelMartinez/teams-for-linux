const os = require('os');
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

const isMac = os.platform() === 'darwin';

const KEY_MAPS = {
	'CTRL_+': () => zoom.increaseZoomLevel(),
	'CTRL_=': () => zoom.increaseZoomLevel(),
	'CTRL_-': () => zoom.decreaseZoomLevel(),
	'CTRL__': () => zoom.decreaseZoomLevel(),
	'CTRL_0': () => zoom.resetZoomLevel(),
	// Alt (Option) Left / Right is used to jump words in Mac, so diabling the history navigation for Mac here
	...(!isMac ? 
		{ 
			'ALT_ArrowLeft': () => window.history.back(),
		    'ALT_ArrowRight': () => window.history.forward()
		} 
		: {}
		)
};

function initInternal() {
	whenWindowReady(addEventListeners);
}

function whenWindowReady(callback) {
	if (window) {
		callback();
	} else {
		setTimeout(() => whenWindowReady(callback), 1000);
	}
}

function addEventListeners() {
	window.addEventListener('keydown', keyDownEventHandler, false);
	window.addEventListener('wheel', wheelEventHandler, {passive: false});
	whenIframeReady((iframe) => {
		iframe.contentDocument.addEventListener('keydown', keyDownEventHandler, false);
		iframe.contentDocument.addEventListener('wheel', wheelEventHandler, {passive: false});
	});
}

function whenIframeReady(callback) {
	const iframe = window.document.getElementsByTagName('iframe')[0];
	if (iframe) {
		callback(iframe);
	} else {
		setTimeout(() => whenIframeReady(callback), 1000);
	}
}

function keyDownEventHandler(event) {
	const keyName = event.key;
	if (keyName === 'Control' || keyName === 'Alt') {
		return;
	}

	fireEvent(event, keyName);
}

function wheelEventHandler(event) {
	if (event.ctrlKey) {
		event.preventDefault();
		if (event.deltaY > 0) {
			zoom.decreaseZoomLevel();
		} else if (event.deltaY < 0) {
			zoom.increaseZoomLevel();
		}
	}
}

function getKeyName(event, keyName) {
	return `${event.ctrlKey ? 'CTRL_' : ''}${event.altKey ? 'ALT_' : ''}${keyName}`;
}

function fireEvent(event, keyName) {
	const handler = KEY_MAPS[getKeyName(event, keyName)];
	if (typeof (handler) === 'function') {
		event.preventDefault();
		handler();
	}
}

module.exports = new Shortcuts();

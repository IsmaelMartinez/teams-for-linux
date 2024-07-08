const { ipcMain, BrowserView } = require('electron');
const path = require('path');
const resolutions = [
	{
		width: 1280,
		height: 720,
		name: 'HD',
		alt_name: '720p',
		default: false
	},
	{
		width: 1920,
		height: 1080,
		name: 'FHD',
		alt_name: '1080p',
		default: true
	},
	{
		width: 2048,
		height: 1080,
		name: '2K',
		alt_name: 'QHD',
		default: false
	},
	{
		width: 3840,
		height: 2160,
		name: '4K',
		alt_name: 'UHD',
		default: false
	}
];

let _StreamSelector_parent = new WeakMap();
let _StreamSelector_window = new WeakMap();
let _StreamSelector_selectedSource = new WeakMap();
let _StreamSelector_callback = new WeakMap();
class StreamSelector {
	/**
	 * @param {BrowserWindow} parent 
	 */
	constructor(parent) {
		_StreamSelector_parent.set(this, parent);
		_StreamSelector_window.set(this, null);
		_StreamSelector_selectedSource.set(this, null);
		_StreamSelector_callback.set(this, null);
	}

	/**
	 * @type {BrowserWindow}
	 */
	get parent() {
		return _StreamSelector_parent.get(this);
	}

	/**
	 * @type {BrowserView}
	 */
	get view() {
		return _StreamSelector_window.get(this);
	}

	set view(value) {
		_StreamSelector_window.set(this, value);
	}

	get selectedSource() {
		return _StreamSelector_selectedSource.get(this);
	}

	set selectedSource(value) {
		_StreamSelector_selectedSource.set(this, value);
	}

	get callback() {
		return _StreamSelector_callback.get(this);
	}

	set callback(value) {
		if (typeof (value) == 'function') {
			_StreamSelector_callback.set(this, value);
		}
	}

	show(callback) {
		let self = this;
		self.callback = callback;
		self.view = new BrowserView({
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false
			}
		});

		createScreenRequestHandler();
		self.view.webContents.loadFile(path.join(__dirname, 'index.html'));
		self.parent.addBrowserView(self.view);

		let _resize = () => {
			resizeView(self);
		};
		resizeView(self);

		let _close = (_event, source) => {
			closeView({ view: self, _resize, _close, source });
		};

		this.parent.on('resize', _resize);
		ipcMain.once('selected-source', _close);
		ipcMain.once('close-view', _close);
	}
}

function closeView(properties) {
	properties.view.parent.setBrowserView(null);
	properties.view.view.webContents.destroy();
	properties.view.view = null;
	properties.view.parent.removeListener('resize', properties._resize);
	ipcMain.removeListener('selected-source', properties._close);
	ipcMain.removeListener('close-view', properties._close);
	if (properties.view.callback) {
		properties.view.callback(properties.source);
	}
}

function resizeView(view) {
	setTimeout(() => {
		const pbounds = view.parent.getBounds();
		view.view.setBounds({
			x: 0,
			y: pbounds.height - 180,
			width: pbounds.width,
			height: 180
		});
	}, 0);
}

function createScreenRequestHandler() {
	ipcMain.once('get-screensizes-request', event => {
		event.reply('get-screensizes-response', resolutions.map(resolution => {
			return Object.assign({}, resolution);
		}));
	});
}

module.exports = { StreamSelector };

const { ipcMain, BrowserView, screen } = require('electron');
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

	/**
	 * @type {string}
	 */
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

	/**
	 * 
	 * @param {(sourceId:string)=>void} callback 
	 */
	show(callback) {
		let self = this;
		self.callback = callback;
		self.view = new BrowserView({
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false
			}
		});

		ipcMain.once('get-screensizes-request', event => {
			const pdisplay = screen.getPrimaryDisplay();
			event.reply('get-screensizes-response', resolutions.slice(0, resolutions.findIndex(r => {
				return r.width >= pdisplay.size.width && r.height >= pdisplay.size.height;
			}) + 1).map(s => {
				return Object.assign({}, s);
			}));
		});

		self.view.webContents.loadFile(path.join(__dirname, 'index.html'));
		self.parent.addBrowserView(self.view);
		let _resize = () => {
			setTimeout(() => {
				const pbounds = self.parent.getBounds();
				self.view.setBounds({
					x: 0,
					y: pbounds.height - 180,
					width: pbounds.width,
					height: 180
				});
			}, 0);
		};
		_resize();

		let _close = (event, source) => {
			self.parent.removeBrowserView(self.view);
			self.view = null;
			self.parent.removeListener('resize', _resize);
			ipcMain.removeListener('selected-source', _close);
			ipcMain.removeListener('close-view', _close);
			if (self.callback) {
				self.callback(source);
			}
		};

		this.parent.on('resize', _resize);
		ipcMain.once('selected-source', _close);
		ipcMain.once('close-view', _close);
	}
}

module.exports = { StreamSelector };
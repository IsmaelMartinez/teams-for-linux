const { ipcMain, WebContentsView } = require('electron');
const path = require('path');

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
	 * @type {WebContentsView}
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
		self.view = new WebContentsView({
			webPreferences: {
				preload: path.join(__dirname, 'preload.js')
			}
		});

		self.view.webContents.loadFile(path.join(__dirname, 'index.html'));
		self.parent.contentView.addChildView(self.view);

		let _resize = () => {
			resizeView(self);
		};
		resizeView(self);

		let _close = (_event, source) => {
			//'screen:x:0' -> whole screen
			//'window:x:0' -> small window
			// show captured source in a new view? Maybe reuse the same view, but make it smaller? probably best a new "file"/view
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

module.exports = { StreamSelector };

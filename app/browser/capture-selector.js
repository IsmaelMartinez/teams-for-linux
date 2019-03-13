const { remote } = require('electron');
const { BrowserWindow } = remote;

function selectSource(callback) {
	const selectorWindow = new BrowserWindow({
		title: 'Share Your Screen',
		modal: true,
		parent: remote.getCurrentWindow(),
		autoHideMenuBar: true,
		width: 680,
		height: 480
	});

	selectorWindow.webContents.once('did-finish-load', function () {
		selectorWindow.emit('pickDesktopMedia', ['screen', 'window']);
	});

	// Launch fullscreen with DevTools open, usage: npm run debug
	// selectorWindow.webContents.openDevTools()
	// mainWindow.maximize()
	// require('devtron').install()

	const url = require('url').format({
		protocol: 'file',
		slashes: true,
		pathname: require('path').join(__dirname, 'capture-selector.html')
	});

	selectorWindow.on('close', () => callback());
	selectorWindow.on('choseDesktopMedia', callback);
	selectorWindow.loadURL(url);
}

module.exports = { selectSource };
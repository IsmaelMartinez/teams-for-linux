const instance = require('./instance');

// MS function overrides
let bgMSService = null;
let bgMSMethod = null;
// eslint-disable-next-line no-unused-vars
let config = null;
/**
 * @type {Electron.IpcRenderer}
 */
let ipRenderer = null;

/**
 * @param {object} conf 
 * @param {Electron.IpcRenderer} ipcr 
 */
function init(conf, ipcr) {
	config = conf;
	ipRenderer = ipcr;
	instance.whenReady().then(overrideMSMethod).catch(() => {
		console.error('Failed to override MS Method');
	});
}

/**
 * @param {{controller:object,injector:object}} inst 
 */
async function overrideMSMethod(inst) {
	bgMSService = inst.injector.get('customVideoBackgroundsService');
	bgMSMethod = bgMSService.getProvidedImagesFromCdn;
	bgMSService.getProvidedImagesFromCdn = customBGProvider;
}

async function customBGProvider(...args) {
	/**
	 * @type {Array<any>}
	 */
	const ms_response = config.customBGServiceIgnoreMSDefaults ? [] : await bgMSMethod.apply(bgMSService, [...args]);
	const customList = await ipRenderer.invoke('getCustomBGList');
	ms_response.push(...customList);
	return ms_response;
}

module.exports = init;


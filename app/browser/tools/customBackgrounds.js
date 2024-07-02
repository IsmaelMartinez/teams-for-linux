const instance = require('./instance');

// MS function overrides
let bgMSService = null;
let bgMSMethod = null;
// eslint-disable-next-line no-unused-vars
let config = null;
let ipRenderer = null;

function init(conf, ipcr) {
	config = conf;
	ipRenderer = ipcr;
	instance.whenReady().then(overrideMSMethod).catch(() => {
		console.error('Failed to override MS Method');
	});
}

async function overrideMSMethod(inst) {
	bgMSService = inst.injector.get('customVideoBackgroundsService');
	bgMSMethod = bgMSService.getProvidedImagesFromCdn;
	bgMSService.getProvidedImagesFromCdn = customBGProvider;
}

async function customBGProvider(...args) {
	const ms_response = config.customBGServiceIgnoreMSDefaults ? [] : await bgMSMethod.apply(bgMSService, [...args]);
	const customList = await ipRenderer.invoke('get-custom-bg-list');
	ms_response.push(...customList);
	return ms_response;
}

module.exports = init;
const instance = require('./instance');
const ReactHandler = require('./reactHandler');

let _Settings_config = new WeakMap();
let _Settings_ipcRenderer = new WeakMap();
class Settings {
	init(config, ipcRenderer) {
		_Settings_config.set(this, config);
		_Settings_ipcRenderer.set(this, ipcRenderer);
		this.ipcRenderer.on('get-teams-settings', retrieve);
		this.ipcRenderer.on('set-teams-settings', restore);
	}

	get config() {
		return _Settings_config.get(this);
	}

	get ipcRenderer() {
		return _Settings_ipcRenderer.get(this);
	}
}

async function retrieve(event) {
	const clientPreferences = ReactHandler.getTeams2ClientPreferences();

	if (!clientPreferences) {
		console.warn('Failed to retrieve Teams settings from react');
		const inst = await instance.whenReady().catch(() => {
			console.warn('Failed to retrieve Teams settings from angular');
		});
		const settings = {
			theme: inst.controller.layoutService.getTheme(),
			chatDensity: inst.controller.layoutService.getChatDensity(),
			devices: inst.controller.callingService._deviceManagerService.deviceManager.getSelectedDevices()
		};
		settings.devices.camera = getDeviceLabelFromId(inst.controller, settings.devices.camera, 1);
		settings.devices.microphone = getDeviceLabelFromId(inst.controller, settings.devices.microphone, 2);
		settings.devices.speaker = getDeviceLabelFromId(inst.controller, settings.devices.speaker, 3);
		event.sender.send('get-teams-settings', settings);
	} else {
		const settings = {
			theme: clientPreferences.theme.userTheme,
			chatDensity: clientPreferences.density.chatDensity,
		};
		event.sender.send('get-teams-settings', settings);
	}
}

function getDeviceLabelFromId(controller, id, kind) {
	const item = controller.callingService._deviceManagerService.devices.filter(f => f.id === id && f.kind === kind)[0];
	return item ? item.label : '';
}

async function restore(event, ...args) {
	const clientPreferences = ReactHandler.getTeams2ClientPreferences();

	if (!clientPreferences) {
		console.warn('Failed to retrieve Teams settings from react');
		const inst = await instance.whenReady().catch(() => {
			console.warn('Failed to retrieve Teams settings from angular');
		});

		inst.controller.layoutService.setTheme(args[0].theme);
		inst.controller.layoutService.setChatDensity(args[0].chatDensity);
		args[0].devices.camera = getDeviceIdFromLabel(inst.controller,args[0].devices.camera,1);
		args[0].devices.microphone = getDeviceIdFromLabel(inst.controller,args[0].devices.microphone,2);
		args[0].devices.speaker = getDeviceIdFromLabel(inst.controller,args[0].devices.speaker,3);
		inst.controller.callingService._deviceManagerService.deviceManager.selectDevices(args[0].devices);
		event.sender.send('set-teams-settings', true);
	} else {
		clientPreferences.theme.userTheme = args[0].theme;
		clientPreferences.density.chatDensity = args[0].chatDensity;
		event.sender.send('set-teams-settings', true);
	}
}

function getDeviceIdFromLabel(controller, label, kind) {
	const item = controller.callingService._deviceManagerService.devices.filter(f => f.label === label && f.kind === kind)[0];
	return item ? item.id : '';
}

module.exports = new Settings();
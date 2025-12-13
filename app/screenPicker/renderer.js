// Screen picker renderer script
// This runs in the renderer process of the screen picker window

document.addEventListener('DOMContentLoaded', () => {
	console.debug('[ScreenPicker] Renderer loaded');

	// Listen for sources list from main process
	if (window.electron?.ipcRenderer) {
		window.electron.ipcRenderer.on('sources-list', (sources) => {
			renderSources(sources);
		});
	}
});

function renderSources(sources) {
	const container = document.getElementById('sources-container');
	if (!container) return;

	container.innerHTML = '';

	for (const source of sources) {
		const element = createSourceElement(source);
		container.appendChild(element);
	}
}

function createSourceElement(source) {
	const div = document.createElement('div');
	div.className = 'source-item';
	div.innerHTML = `
		<img src="${source.thumbnail}" alt="${source.name}">
		<span>${source.name}</span>
	`;

	div.addEventListener('click', () => {
		if (window.electron?.ipcRenderer) {
			window.electron.ipcRenderer.send('source-selected', source);
		}
	});

	return div;
}

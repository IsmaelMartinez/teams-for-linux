const {ipcRenderer} = require('electron');

function sendForm(event) { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('submitForm',
		{
			username: document.getElementById('username').value,
			password: document.getElementById('password').value,
		});
}

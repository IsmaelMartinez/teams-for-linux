'use strict';
const { ipcRenderer } = require('electron');

function sendForm(event) {
  event.preventDefault();
  ipcRenderer.send('submitForm',
    {
      'username': document.getElementById("username").value,
      'password': document.getElementById("password").value
    }
  );
}
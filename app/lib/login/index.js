'use strict';

(function () {
  const { ipcRenderer } = require('electron');
  
  document.getElementById('loginForm').addEventListener('submit', function (event) {
      event.preventDefault();
      console.log('summit');
      ipcRenderer.send('submitForm', "formData");
  })

//   function login() {
//       //document.getElementById("loginForm").submit(); 
//       ipcRenderer.send('submitForm', "formData");
//   }
})();

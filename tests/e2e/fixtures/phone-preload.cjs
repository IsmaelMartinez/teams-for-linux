const path = require('node:path');
const override = process.env.TEAMS_PHONE_PACKAGE_ASAR
  ? require(path.join(process.env.TEAMS_PHONE_PACKAGE_ASAR, 'app/browser/tools/webauthnOverride'))
  : require('../../../app/browser/tools/webauthnOverride');
override.init({ auth: { webauthn: { enabled: true, backend: 'phone' } } }, require('electron').ipcRenderer);

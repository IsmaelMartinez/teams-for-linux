const fs = require("node:fs");
const { getConfigFilePath } = require("../config");

// config.json usually doesn't exist yet ("No config file found ... using
// default values" is the common startup case), and shell.openPath on a
// missing path just errors silently instead of doing anything useful, so a
// stub is written first (and the directory created if needed).
function openConfigFile(shell, configPath) {
  const configFilePath = getConfigFilePath(configPath);
  if (!fs.existsSync(configFilePath)) {
    fs.mkdirSync(configPath, { recursive: true });
    fs.writeFileSync(configFilePath, "{}\n");
  }
  shell.openPath(configFilePath);
}

function openConfigFolder(shell, configPath) {
  shell.openPath(configPath);
}

module.exports = { openConfigFile, openConfigFolder };

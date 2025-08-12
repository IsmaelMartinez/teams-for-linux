const disableAutogain = require("./disableAutogain");

function init(config) {
  window.addEventListener("DOMContentLoaded", () => {
    if (config.disableAutogain) {
      disableAutogain();
    }
  });
}

module.exports = init;

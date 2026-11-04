// The Teams window shares its JavaScript world with the preload
// (contextIsolation off), so whatever `get-config` returns is readable by page
// script through electronAPI.getConfig(). No renderer code needs credentials
// or the account and broker details next to them, so they never leave the
// main process (GHSA-58j7-22f8-6xqp). Both spellings are listed:
// applyRenamedOptions copies each nested value onto its deprecated flat name.
const SECRET_PATHS = [
  ["mqtt", "password"],
  ["mqtt", "username"],
  ["mqtt", "brokerUrl"],
  ["auth", "clientCertificate", "password"],
  ["auth", "clientCertificate", "path"],
  ["auth", "basic", "user"],
  ["auth", "intune", "user"],
  ["auth", "basic", "passwordCommand"],
  ["auth", "webLogin", "user"],
  ["auth", "webLogin", "passwordCommand"],
  ["clientCertPassword"],
  ["clientCertPath"],
  ["ssoBasicAuthUser"],
  ["ssoBasicAuthPasswordCommand"],
];

function deletePath(target, keys) {
  let node = target;
  for (const key of keys.slice(0, -1)) {
    node = node?.[key];
    if (node === null || typeof node !== "object") return;
  }
  delete node[keys.at(-1)];
}

/**
 * Copy of the config that is safe to hand to a renderer.
 * @param {object} config - the resolved application config
 * @returns {object}
 */
function toRendererConfig(config) {
  const copy = structuredClone(config);
  for (const keys of SECRET_PATHS) deletePath(copy, keys);
  return copy;
}

module.exports = { toRendererConfig, SECRET_PATHS };

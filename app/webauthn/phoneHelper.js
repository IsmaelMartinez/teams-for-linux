// MIT-licensed helper protocol runner; see phone-helper-LICENSE.
const { spawn } = require("node:child_process");
const MAX_BYTES = 1024 * 1024;

function runBackend({ helperPath, request, timeout, signal, onQr, spawnProcess = spawn }) {
  return new Promise((resolve, reject) => {
    let child;
    let pending = "";
    let bytes = 0;
    let settled = false;
    let timer;
    const fail = (name, message) => finish({ name, message });
    const abort = () => fail("AbortError", "Phone authentication was cancelled.");
    const finish = (error, credential) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      child?.kill();
      if (error) reject(Object.assign(new Error(error.message), { name: error.name }));
      else resolve(credential);
    };
    if (signal?.aborted) return abort();
    try {
      // Use pipes so authentication data stays out of argv and stderr logs.
      child = spawnProcess(helperPath, [], { stdio: ["pipe", "pipe", "ignore"] });
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => fail("NotAllowedError", "Phone authentication timed out."), timeout);
      child.on("error", () => fail("NotSupportedError", "The phone-passkey helper could not start."));
      child.stdin.on("error", () => fail("OperationError", "The authentication helper stopped."));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (settled) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_BYTES) return fail("OperationError", "Invalid authentication helper output.");
        pending += chunk;
        let end;
        while (!settled && (end = pending.indexOf("\n")) !== -1) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          try {
            const message = JSON.parse(line);
            if (message.type === "qr" && typeof message.svg === "string" && message.svg.length <= MAX_BYTES) {
              onQr(message.svg);
            } else if (message.type === "result" && message.credential?.type === "public-key" &&
                typeof message.credential.id === "string" && message.credential.response) {
              finish(null, message.credential);
            } else if (message.type === "error") {
              const names = new Set(["SecurityError", "NotSupportedError", "NotAllowedError", "OperationError", "TypeError"]);
              fail(names.has(message.name) ? message.name : "NotAllowedError",
                typeof message.message === "string" ? message.message.slice(0, 256) : "Phone authentication failed.");
            } else {
              fail("OperationError", "Invalid authentication helper output.");
            }
          } catch {
            fail("OperationError", "Invalid authentication helper output.");
          }
        }
      });
      child.on("close", () => fail("NotAllowedError", "Phone authentication did not complete."));
      child.stdin.end(JSON.stringify(request));
    } catch {
      fail("NotSupportedError", "The phone-passkey helper could not start.");
    }
  });
}

module.exports = { runBackend };

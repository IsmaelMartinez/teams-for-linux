// MIT-licensed helper protocol runner; see phone-helper-LICENSE.
const { spawn } = require("node:child_process");
const MAX_BYTES = 1024 * 1024;

const ERROR_NAMES = new Set(["SecurityError", "NotSupportedError", "NotAllowedError", "OperationError", "TypeError"]);

function parseMessage(line) {
  const message = JSON.parse(line);
  switch (message.type) {
    case "qr":
      if (typeof message.svg === "string" && message.svg.length <= MAX_BYTES) return message;
      break;
    case "result":
      if (message.credential?.type === "public-key" && typeof message.credential.id === "string" &&
          message.credential.response) return message;
      break;
    case "error":
      return { type: "error", name: ERROR_NAMES.has(message.name) ? message.name : "NotAllowedError",
        message: typeof message.message === "string" ? message.message.slice(0, 256) : "Phone authentication failed." };
    default:
      break;
  }
  throw new Error("Invalid authentication helper output.");
}

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
            const message = parseMessage(line);
            if (message.type === "qr") onQr(message.svg);
            else if (message.type === "result") finish(null, message.credential);
            else fail(message.name, message.message);
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

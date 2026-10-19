const { randomUUID } = require("node:crypto");

// The postMessage payload is only a wake-up signal. Requests and responses
// stay with the document that called credentials.get(), even if IDs are forged.
function createFrameRelay() {
  const documents = new WeakMap();
  return {
    register(frame) {
      if (documents.has(frame)) return documents.get(frame);
      const key = `__phonePasskey_${randomUUID().replaceAll("-", "")}`;
      documents.set(frame, key);
      return key;
    },
    async read(frame, id) {
      const key = documents.get(frame);
      if (!key || typeof id !== "string" || id.length > 128) throw new Error("Unknown phone request.");
      const request = await frame.executeJavaScript(`window[${JSON.stringify(key)}]?.(${JSON.stringify(id)})`);
      if (!request || (request.requestId !== id && request.cancelRequestId !== id)) {
        throw new Error("Unknown phone request.");
      }
      return request;
    },
    async respond(frame, id, result) {
      const key = documents.get(frame);
      if (key && !frame.detached) {
        await frame.executeJavaScript(`window[${JSON.stringify(key)}]?.(${JSON.stringify(id)}, ${JSON.stringify(result)})`);
      }
    },
  };
}

module.exports = { createFrameRelay };

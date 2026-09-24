"use strict";

const { sanitize: sanitizePii } = require("./logSanitizer");

// Teams floods the renderer with these error signatures whenever no user is
// signed in, until the auth-recovery layer (see app/mainAppWindow/index.js)
// clears stale state and reloads. The recovery layer is the actionable
// channel for these; mirroring them as console.error in our logs just buries
// real issues. Down-leveling to console.debug keeps them available without
// the noise.
const PRE_LOGIN_AUTH_NOISE_PATTERNS = [
  "login_required",
  "aadsts50058",
  "interactionrequired",
  "authfailed",
  // Fires on every healthy startup, before identity loads.
  "[_getuseridentifier] user missing",
];

function isPreLoginAuthNoise(message) {
  if (typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return PRE_LOGIN_AUTH_NOISE_PATTERNS.some((p) => lower.includes(p));
}

// webpack's ChunkLoadError: "Loading chunk <id> failed.\n(<reason>: <url>)",
// reason being timeout, error or missing. The CSS form can omit the reason
// (reported as "error"): "Loading CSS chunk <id> failed.\n(<url>)".
// Unanchored, so the "Uncaught ChunkLoadError: " prefix of a window error
// still matches. The URL may not contain control or format characters
// (\p{C}): the file name is printed in a plain-text log line.
const CHUNK_LOAD_FAILURE = /Loading (?:CSS )?chunk \S+ failed\.\s*\((?:([a-z]+): )?([^\s)\p{C}]+)\)/iu;

// Returns { reason, file } for a chunk load failure, else null. `file` is the
// URL's last path segment without query or fragment.
function parseChunkLoadFailure(message) {
  if (typeof message !== "string") return null;
  const match = CHUNK_LOAD_FAILURE.exec(message);
  if (!match) return null;
  const [, reason = "error", url] = match;
  return { reason, file: url.split(/[?#]/, 1)[0].split("/").pop() };
}

// One log line per chunk instead of a full error block each. Only a timeout
// points at the connection; error and missing are more often a Teams deploy
// or a blocked host.
function formatChunkLoadWarning({ reason, file }) {
  const name = sanitizePii(file) || "unknown";
  return reason === "timeout"
    ? `[NETWORK] Teams code chunk timed out: ${name}. The connection may be too slow for Teams to fetch it in time.`
    : `[NETWORK] Teams code chunk failed to load (${reason}): ${name}`;
}

module.exports = { isPreLoginAuthNoise, parseChunkLoadFailure, formatChunkLoadWarning };

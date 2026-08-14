const PLACEHOLDER_NAME = "This account";
const IDENTITY_MAX_LENGTH = 254;
const PARSE_MAX_LENGTH = 100_000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,64}$/;

function isPlaceholderName(name) {
  return !name || name === PLACEHOLDER_NAME;
}

function pickLabel(account) {
  if (account?.identity && isPlaceholderName(account.name)) {
    return account.identity;
  }
  return account?.name || PLACEHOLDER_NAME;
}

function normalizeIdentity(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > IDENTITY_MAX_LENGTH) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

function identityFromObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  return (
    normalizeIdentity(obj.username) ||
    normalizeIdentity(obj.preferred_username) ||
    normalizeIdentity(obj.upn) ||
    normalizeIdentity(obj.unique_name) ||
    normalizeIdentity(obj.email) ||
    normalizeIdentity(obj.userPrincipalName)
  );
}

function decodeBase64Url(segment) {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4;
  const base64 = pad ? padded + "=".repeat(4 - pad) : padded;
  return Buffer.from(base64, "base64").toString("utf8");
}

function identityFromJwt(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return identityFromObject(JSON.parse(decodeBase64Url(parts[1])));
  } catch {
    return null;
  }
}

function isLikelyAuthStorageKey(key) {
  if (typeof key !== "string") return false;
  const k = key.toLowerCase();
  return (
    k.includes("msal") ||
    k.includes("idtoken") ||
    k.includes("id_token") ||
    k.includes("login_hint") ||
    k.includes("loginhint") ||
    k.includes("preferred_username")
  );
}

function identityFromJsonArray(items) {
  for (const item of items) {
    const found = identityFromObject(item) || identityFromJwt(item);
    if (found) return found;
  }
  return null;
}

function identityFromJsonText(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return identityFromJsonArray(parsed);
    }
    return (
      identityFromObject(parsed) ||
      identityFromJwt(parsed.id_token) ||
      identityFromJwt(parsed.idToken) ||
      identityFromJwt(parsed.access_token)
    );
  } catch {
    return null;
  }
}

function identityFromUnknown(value) {
  if (typeof value === "string" && value.length > PARSE_MAX_LENGTH) {
    return null;
  }
  const direct = normalizeIdentity(value);
  if (direct) return direct;
  if (typeof value !== "string") {
    return identityFromObject(value);
  }
  if (value.startsWith("{") || value.startsWith("[")) {
    return identityFromJsonText(value);
  }
  return identityFromJwt(value);
}

function identityFromStorage(getItem, keys) {
  if (typeof getItem !== "function" || !Array.isArray(keys)) return null;
  for (const key of keys) {
    if (!isLikelyAuthStorageKey(key)) continue;
    let value;
    try {
      value = getItem(key);
    } catch {
      continue;
    }
    const found = identityFromUnknown(value);
    if (found) return found;
  }
  return null;
}

module.exports = {
  PLACEHOLDER_NAME,
  IDENTITY_MAX_LENGTH,
  isPlaceholderName,
  isLikelyAuthStorageKey,
  pickLabel,
  normalizeIdentity,
  identityFromObject,
  identityFromJwt,
  identityFromUnknown,
  identityFromStorage,
};

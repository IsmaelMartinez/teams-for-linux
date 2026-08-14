const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_ACCOUNTS = 3;
const HOME_ID = "home";
const REGISTRY_FILENAME = "concurrent-accounts.json";
const FAMILY_MARKER_FILENAME = "instance-family.json";
const PID_FILENAME = "instance.pid";
const NAME_MAX_LENGTH = 64;

function getRegistryPath(homeUserDataDir) {
  return path.join(homeUserDataDir, REGISTRY_FILENAME);
}

function getInstancesRoot(homeUserDataDir) {
  return `${homeUserDataDir}-instances`;
}

function getAccountUserDataDir(homeUserDataDir, id) {
  return path.join(getInstancesRoot(homeUserDataDir), id);
}

function getFamilyMarkerPath(userDataDir) {
  return path.join(userDataDir, FAMILY_MARKER_FILENAME);
}

function getPidPath(userDataDir) {
  return path.join(userDataDir, PID_FILENAME);
}

function samePath(a, b) {
  if (!a || !b) return false;
  return path.resolve(a) === path.resolve(b);
}

function slugify(name) {
  const slug = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/[\s_]+/g, "-")
    .slice(0, 32);
  return slug || "account";
}

function deriveClass(name, id) {
  const slug = slugify(name);
  const suffix = typeof id === "string" && id !== HOME_ID ? id.slice(0, 8) : "";
  return suffix ? `teams-for-linux-${slug}-${suffix}` : `teams-for-linux-${slug}`;
}

function deriveAppTitle(name) {
  return `Microsoft Teams — ${name}`;
}

function emptyRegistry() {
  return { version: 1, accounts: [] };
}

function loadRegistry(homeUserDataDir) {
  const filePath = getRegistryPath(homeUserDataDir);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.accounts)) {
      return emptyRegistry();
    }
    return { version: 1, accounts: parsed.accounts.filter(isAccountRecord) };
  } catch (error) {
    if (error.code === "ENOENT") return emptyRegistry();
    console.warn("[ConcurrentAccounts] Failed to read registry", {
      message: error.message,
    });
    return emptyRegistry();
  }
}

function isAccountRecord(record) {
  return (
    record &&
    typeof record === "object" &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.userDataDir === "string"
  );
}

function saveRegistry(homeUserDataDir, data) {
  const filePath = getRegistryPath(homeUserDataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const payload = {
    version: 1,
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
  };
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tmp, filePath);
}

function normalizeName(name) {
  if (typeof name !== "string") {
    throw new TypeError("[ConcurrentAccounts] Name is required.");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("[ConcurrentAccounts] Name is required.");
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new Error(
      `[ConcurrentAccounts] Name exceeds ${NAME_MAX_LENGTH} characters.`
    );
  }
  return trimmed;
}

function assertUniqueName(accounts, name, exceptId) {
  const needle = name.toLowerCase();
  const clash = accounts.some(
    (account) =>
      account.id !== exceptId && account.name.toLowerCase() === needle
  );
  if (clash) {
    throw new Error("[ConcurrentAccounts] An account with that name already exists.");
  }
}

function ensureHome(data, homeUserDataDir, extras = {}) {
  const existing = data.accounts.find((account) => account.id === HOME_ID);
  if (existing) {
    if (!samePath(existing.userDataDir, homeUserDataDir)) {
      existing.userDataDir = homeUserDataDir;
    }
    return existing;
  }
  const name = extras.name ? normalizeName(extras.name) : "This account";
  const home = {
    id: HOME_ID,
    name,
    userDataDir: homeUserDataDir,
    class: extras.wmClass || "teams-for-linux",
    appTitle: extras.appTitle || deriveAppTitle(name),
    isHome: true,
  };
  data.accounts.unshift(home);
  return home;
}

function addAccount(data, { name, homeUserDataDir }) {
  const trimmed = normalizeName(name);
  assertUniqueName(data.accounts, trimmed);
  if (data.accounts.length >= MAX_ACCOUNTS) {
    throw new Error(
      `[ConcurrentAccounts] At most ${MAX_ACCOUNTS} accounts can be connected at the same time.`
    );
  }
  const id = crypto.randomUUID();
  const account = {
    id,
    name: trimmed,
    userDataDir: getAccountUserDataDir(homeUserDataDir, id),
    class: deriveClass(trimmed, id),
    appTitle: deriveAppTitle(trimmed),
    isHome: false,
  };
  data.accounts.push(account);
  return account;
}

function updateAccount(data, id, patch) {
  const account = data.accounts.find((entry) => entry.id === id);
  if (!account) {
    throw new Error("[ConcurrentAccounts] Unknown account.");
  }
  if (patch && Object.hasOwn(patch, "name")) {
    const trimmed = normalizeName(patch.name);
    assertUniqueName(data.accounts, trimmed, id);
    account.name = trimmed;
    if (!account.isHome) {
      account.appTitle = deriveAppTitle(trimmed);
    }
  }
  return account;
}

function removeAccount(data, id) {
  if (id === HOME_ID) {
    throw new Error("[ConcurrentAccounts] The original account cannot be removed.");
  }
  const index = data.accounts.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error("[ConcurrentAccounts] Unknown account.");
  }
  const [removed] = data.accounts.splice(index, 1);
  return removed;
}

function readFamilyMarker(userDataDir) {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(getFamilyMarkerPath(userDataDir), "utf8")
    );
    if (parsed && typeof parsed.homeUserDataDir === "string") {
      return parsed.homeUserDataDir;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[ConcurrentAccounts] Failed to read family marker", {
        message: error.message,
      });
    }
  }
  return null;
}

function writeFamilyMarker(userDataDir, homeUserDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    getFamilyMarkerPath(userDataDir),
    `${JSON.stringify({ homeUserDataDir }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
}

function writePid(userDataDir, pid) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(getPidPath(userDataDir), `${pid}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function readPid(userDataDir) {
  try {
    const raw = fs.readFileSync(getPidPath(userDataDir), "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[ConcurrentAccounts] Failed to read instance pid", {
        message: error.message,
      });
    }
    return null;
  }
}

function clearPid(userDataDir) {
  try {
    fs.unlinkSync(getPidPath(userDataDir));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[ConcurrentAccounts] Failed to clear instance pid", {
        message: error.message,
      });
    }
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isAccountRunning(userDataDir) {
  return isPidAlive(readPid(userDataDir));
}

module.exports = {
  MAX_ACCOUNTS,
  HOME_ID,
  NAME_MAX_LENGTH,
  getRegistryPath,
  getInstancesRoot,
  getAccountUserDataDir,
  samePath,
  slugify,
  deriveClass,
  deriveAppTitle,
  loadRegistry,
  saveRegistry,
  ensureHome,
  addAccount,
  updateAccount,
  removeAccount,
  readFamilyMarker,
  writeFamilyMarker,
  writePid,
  readPid,
  clearPid,
  isPidAlive,
  isAccountRunning,
};

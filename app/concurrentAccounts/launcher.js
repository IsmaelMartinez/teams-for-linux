const { spawn } = require("node:child_process");

const SKIP_AUTO_LAUNCH_ENV = "TEAMS_FOR_LINUX_SKIP_INSTANCE_AUTO_LAUNCH";

function buildLaunchPlan({
  isPackaged,
  execPath,
  appPath,
  appImage,
  userDataDir,
  wmClass,
  appTitle,
}) {
  const command = appImage || execPath;
  const args = [];
  if (!isPackaged && !appImage) {
    args.push(appPath);
  }
  args.push(`--user-data-dir=${userDataDir}`);
  if (wmClass) {
    args.push(`--class=${wmClass}`);
  }
  if (appTitle) {
    args.push(`--appTitle=${appTitle}`);
  }
  return { command, args };
}

function spawnInstance(plan, spawnFn = spawn) {
  const child = spawnFn(plan.command, plan.args, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      [SKIP_AUTO_LAUNCH_ENV]: "1",
    },
  });
  child.unref();
  return child.pid;
}

function shouldSkipAutoLaunch(env = process.env) {
  return env[SKIP_AUTO_LAUNCH_ENV] === "1" || Boolean(env.E2E_USER_DATA_DIR);
}

module.exports = {
  SKIP_AUTO_LAUNCH_ENV,
  buildLaunchPlan,
  spawnInstance,
  shouldSkipAutoLaunch,
};

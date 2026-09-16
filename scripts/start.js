const electronPath = require("electron");
const appArgs = process.argv.slice(2);
const hasOzonePlatform = appArgs.some(
  (arg, index) =>
    arg === "--ozone-platform" ||
    arg.startsWith("--ozone-platform=") ||
    (index > 0 && appArgs[index - 1] === "--ozone-platform"),
);

if (
  process.platform === "linux" &&
  process.env.XDG_SESSION_TYPE === "wayland" &&
  !hasOzonePlatform
) {
  appArgs.push("--ozone-platform=x11");
}

const child = spawn(electronPath, ["./app", ...appArgs], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error("Failed to start Electron:", error.message);
  process.exitCode = 1;
});

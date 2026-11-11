const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const { chmod } = require("node:fs/promises");
const path = require("node:path");
const { generateReleaseInfo } = require("./generateReleaseInfo");
const { generateDebianChangelog } = require("./generateDebianChangelog");
const { patchSnapDesktopLauncher } = require("./patchSnapDesktopLauncher");

function getAppFileName(context) {
  const productFileName = context.packager.appInfo.productFilename;

  switch (context.electronPlatformName) {
    case "win32":
      return `${productFileName}.exe`;
    case "darwin":
      return `${productFileName}.app`;
    case "mas":
      return `${productFileName}.app`;
    case "linux":
      return context.packager.executableName;
    default:
      return "";
  }
}

exports.default = async function afterPack(context) {
  try {
    // Ensure release info is generated for Linux publishing
    if (context.electronPlatformName === "linux") {
      await generateReleaseInfoForLinux();
      await patchSnapLauncherIfNeeded(context);
    }

    const appPath = `${context.appOutDir}/${getAppFileName(context)}`;
    await chmod(appPath, 0o755);
    await flipFuses(appPath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableCookieEncryption]: true,
    });
  } catch (error) {
    console.error("afterPack error: ", error);
    process.exit(1);
  }
};

// afterPack runs inside doPack, before any target builds, so this is the last
// point at which the snap's launcher scripts can still be fixed up (#2946).
async function patchSnapLauncherIfNeeded(context) {
  if (!context.targets.some((target) => target.name === "snap")) {
    return;
  }
  await patchSnapDesktopLauncher(context.arch);
}

async function generateReleaseInfoForLinux() {
  try {
    console.log("🔄 Generating release info for Linux publishing...");

    const projectRoot = path.join(__dirname, "..");
    const { releaseInfo } = await generateReleaseInfo(projectRoot);

    // Generate Debian changelog for better package metadata (issue #1691)
    console.log("🔄 Generating Debian changelog...");
    await generateDebianChangelog(projectRoot);

    console.log(`✅ Release info ready for Linux publishing`);
    console.log(`   Release Name: ${releaseInfo.releaseName}`);
    console.log(`   Release Date: ${releaseInfo.releaseDate}`);

    return releaseInfo;
  } catch (error) {
    console.error("❌ Error generating release info:", error.message);
    throw error;
  }
}

const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const { chmod } = require("node:fs/promises");
const path = require("node:path");
const { generateReleaseInfo } = require("./generateReleaseInfo");
const { generateDebianChangelog } = require("./generateDebianChangelog");

function getAppFileName(context) {
  return context.packager.executableName;
}

exports.default = async function afterPack(context) {
  try {
    await generateReleaseInfoForLinux();

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

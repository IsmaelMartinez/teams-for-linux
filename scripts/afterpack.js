const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const { chmod } = require("fs/promises");
const path = require('path');
const { generateReleaseInfo } = require('./generateReleaseInfo');

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

async function generateReleaseInfoForLinux() {
  try {
    console.log('🔄 Generating release info for Linux publishing...');
    
    const projectRoot = path.join(__dirname, '..');
    const { releaseInfo } = await generateReleaseInfo(projectRoot);
    
    console.log(`✅ Release info ready for Linux publishing`);
    console.log(`   Release Name: ${releaseInfo.releaseName}`);
    console.log(`   Release Date: ${releaseInfo.releaseDate}`);
    
    return releaseInfo;
  } catch (error) {
    console.error('❌ Error generating release info:', error.message);
    throw error;
  }
}

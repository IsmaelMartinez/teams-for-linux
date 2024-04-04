const {flipFuses, FuseVersion, FuseV1Options} = require('@electron/fuses');
const {chmod} = require('fs/promises');

function getAppFileName(context) {
	const productFileName = context.packager.appInfo.productFilename;

	switch (context.electronPlatformName) {
	case 'win32':
		return `${productFileName}.exe`;
	case 'darwin':
		return `${productFileName}.app`;
	case 'mas':
		return `${productFileName}.app`;
	case 'linux':
		return context.packager.executableName;
	default:
		return '';
	}
}

exports.default = async function afterPack(context) {
	try {
		const path = `${context.appOutDir}/${getAppFileName(context)}`;
		await chmod(path, 0o755);
		await flipFuses(
			path,
			{
				version: FuseVersion.V1,
				[FuseV1Options.EnableCookieEncryption]: true,
			},
		);
	} catch (error) {
		console.error('afterPack error: ', error);
		process.exit(1);
	}
};

const {flipFuses, FuseVersion, FuseV1Options} = require('@electron/fuses');

function getAppFileName(context) {
	const productFileName = context.packager.appInfo.productFilename

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
		await flipFuses(
			`${context.appOutDir}/${getAppFileName(context)}`,
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

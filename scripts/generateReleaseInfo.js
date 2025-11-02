#!/usr/bin/env node

/**
 * Generate release info according to electron-builder ReleaseInfo interface
 * from com.github.IsmaelMartinez.teams_for_linux.appdata.xml file, ensuring version consistency across package files.
 *
 * ReleaseInfo interface: https://www.electron.build/app-builder-lib.interface.releaseinfo
 */

const fs = require("node:fs");
const path = require("node:path");
const xml2js = require("xml2js");

async function generateReleaseInfo(projectRoot = null) {
  const root = projectRoot || path.join(__dirname, "..");

  // Load package.json
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error("package.json not found.");
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  // Load package-lock.json
  const lockPath = path.join(root, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    throw new Error(
      'package-lock.json not found. Please run "npm install" to generate package-lock.json'
    );
  }
  const pkgLock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

  // Check version consistency between package.json and package-lock.json
  if (pkgLock.version !== pkg.version) {
    throw new Error(
      `Version mismatch: package.json (${pkg.version}) vs package-lock.json (${pkgLock.version}). Please run "npm install" to update package-lock.json.`
    );
  }

  // Load com.github.IsmaelMartinez.teams_for_linux.appdata.xml
  const appdataPath = path.join(
    root,
    "com.github.IsmaelMartinez.teams_for_linux.appdata.xml"
  );
  if (!fs.existsSync(appdataPath)) {
    throw new Error(
      "com.github.IsmaelMartinez.teams_for_linux.appdata.xml not found."
    );
  }
  const appdataContent = fs.readFileSync(appdataPath, "utf8");

  // Parse XML
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(appdataContent);

  // Navigate to releases
  const component = result.component;
  if (!component?.releases?.[0]?.release) {
    throw new Error(
      "No releases found in com.github.IsmaelMartinez.teams_for_linux.appdata.xml."
    );
  }

  const releases = component.releases[0].release;

  // Find matching release for current version
  const matchingRelease = releases.find((rel) => rel.$.version === pkg.version);
  if (!matchingRelease) {
    throw new Error(
      `No release entry found for version ${pkg.version} in com.github.IsmaelMartinez.teams_for_linux.appdata.xml. Please add a release entry for this version.`
    );
  }

  // Extract release information
  const releaseDate = matchingRelease.$.date;
  let releaseNotes = "";

  if (matchingRelease.description?.[0]) {
    const descObj = matchingRelease.description[0];

    if (descObj.ul?.[0]?.li) {
      // Extract list items and format as markdown
      const listItems = descObj.ul[0].li.map((li) => {
        // Handle both simple strings and complex objects
        const text = typeof li === "string" ? li : li._ || li;
        return `• ${text}`;
      });
      releaseNotes = listItems.join("\n");
    } else if (typeof descObj === "string") {
      releaseNotes = descObj;
    } else if (descObj._) {
      releaseNotes = descObj._;
    }
  }

  if (!releaseNotes.trim()) {
    throw new Error(
      `Release ${pkg.version} has no description/notes in com.github.IsmaelMartinez.teams_for_linux.appdata.xml. Please add release notes to the <description> section for this version.`
    );
  }

  // Generate ReleaseInfo according to electron-builder interface
  // https://www.electron.build/app-builder-lib.interface.releaseinfo
  const releaseInfo = {
    releaseName: pkg.version,
    releaseNotes: releaseNotes,
    releaseDate: releaseDate,
  };

  return {
    releaseInfo,
    versionInfo: {
      packageJson: pkg.version,
      packageLock: pkgLock.version,
      appdata: pkg.version,
    },
  };
}

// CLI mode when run directly
if (require.main === module) {
  (async () => {
    try {
      const { releaseInfo, versionInfo } = await generateReleaseInfo();

      // Success output    console.log('✅ Version consistency check passed!');
      console.log(`   package.json: ${versionInfo.packageJson}`);
      console.log(`   package-lock.json: ${versionInfo.packageLock}`);
      console.log(
        `   com.github.IsmaelMartinez.teams_for_linux.appdata.xml: ${versionInfo.appdata} (with release notes)`
      );
      console.log("");
      console.log(
        "📋 Generated Release Info (electron-builder ReleaseInfo interface):"
      );
      console.log("");
      console.log(JSON.stringify(releaseInfo, null, 2));

      // Save to file
      const outputPath = path.join(__dirname, "..", "release-info.json");
      fs.writeFileSync(outputPath, JSON.stringify(releaseInfo, null, 2));
      console.log("");
      console.log(`💾 Release info saved to: ${outputPath}`);
    } catch (error) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  })();
}

module.exports = { generateReleaseInfo };

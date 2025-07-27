#!/usr/bin/env node

/**
 * Generate Debian changelog from HISTORY.md and appdata.xml for better package metadata
 * This addresses issue #1691: Debian package contains a nonsense changelog
 */

const fs = require("fs");
const path = require("path");
const xml2js = require("xml2js");

async function generateDebianChangelog(projectRoot = null) {
  const root = projectRoot || path.join(__dirname, "..");

  // Load appdata.xml for release information
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
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(appdataContent);

  // Extract releases
  const component = result.component;
  if (!component?.releases?.[0]?.release) {
    throw new Error("No releases found in appdata.xml.");
  }

  const releases = component.releases[0].release;

  // Generate changelog entries
  let changelogContent = "";

  releases.forEach((release) => {
    const version = release.$.version;
    const date = release.$.date;

    // Convert date to Debian changelog format (RFC 2822)
    const releaseDate = new Date(date);
    const debianDate = releaseDate.toUTCString().replace(/GMT/, "+0000");

    // Extract release notes
    let releaseNotes = "  * Version update.";
    if (release.description?.[0]) {
      const descObj = release.description[0];
      if (descObj.ul?.[0]?.li) {
        const listItems = descObj.ul[0].li.map((li) => {
          const text = typeof li === "string" ? li : li._ || li;
          return `  * ${text}`;
        });
        releaseNotes = listItems.join("\n");
      }
    }

    changelogContent += `teams-for-linux (${version}) stable; urgency=medium\n\n`;
    changelogContent += `${releaseNotes}\n\n`;
    changelogContent += ` -- Ismael Martinez <ismaelmartinez@gmail.com>  ${debianDate}\n\n`;
  });

  return changelogContent;
}

// Generate and save changelog
if (require.main === module) {
  (async () => {
    try {
      const changelog = await generateDebianChangelog();
      const outputPath = path.join(__dirname, "..", "debian-changelog");
      fs.writeFileSync(outputPath, changelog);
      console.log("✅ Debian changelog generated successfully!");
      console.log(`💾 Changelog saved to: ${outputPath}`);
    } catch (error) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  })();
}

module.exports = { generateDebianChangelog };

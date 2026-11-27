#!/usr/bin/env node

/**
 * Record the SHA-256 of every distributable electron-builder produced.
 *
 * Usage: node scripts/recordArtifactChecksums.js <dist-dir> <output-file>
 *
 * The build jobs run dependency install scripts, so they must not hold a
 * signing identity. Each job writes this checksums file instead, and a
 * separate job that runs no project code attests the digests it contains.
 * The output uses the shasum format that actions/attest reads through its
 * `subject-checksums` input: lowercase hex digest, two spaces, file name.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Order does not matter, but ".tar.gz" needs a suffix match, not path.extname.
const DISTRIBUTABLE_SUFFIXES = [
  ".deb",
  ".rpm",
  ".AppImage",
  ".tar.gz",
  ".dmg",
  ".zip",
  ".exe",
];

function isDistributable(fileName) {
  return DISTRIBUTABLE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

function listDistributables(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isDistributable(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function formatChecksums(entries) {
  return entries.map(({ name, digest }) => `${digest}  ${name}\n`).join("");
}

function recordChecksums(dir, outputPath) {
  const names = listDistributables(dir);
  if (names.length === 0) {
    throw new Error(`No distributable files found in ${dir}`);
  }
  const entries = names.map((name) => ({
    name,
    digest: sha256File(path.join(dir, name)),
  }));
  fs.writeFileSync(outputPath, formatChecksums(entries));
  return entries;
}

if (require.main === module) {
  const [dir, outputPath] = process.argv.slice(2);
  if (!dir || !outputPath) {
    console.error(
      "Usage: node scripts/recordArtifactChecksums.js <dist-dir> <output-file>"
    );
    process.exit(2);
  }
  try {
    const entries = recordChecksums(dir, outputPath);
    console.log(`Recorded ${entries.length} checksum(s) in ${outputPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  isDistributable,
  listDistributables,
  formatChecksums,
  recordChecksums,
};

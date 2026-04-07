#!/usr/bin/env node

/**
 * Update appdata.xml with release entry from CHANGELOG.md
 *
 * Reads the latest release version from package.json and the corresponding
 * changelog entries from CHANGELOG.md, then inserts a new <release> entry
 * into the appdata.xml file.
 *
 * This script is called by the release-please workflow after the Release PR
 * is created/updated, to keep appdata.xml in sync with the changelog.
 *
 * Usage:
 *   node scripts/update-appdata-xml.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const APPDATA_PATH = path.join(ROOT, 'com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

/**
 * Extract changelog entries for a specific version from CHANGELOG.md.
 * Returns an array of entry strings (without bullet prefixes).
 */
function extractChangelogEntries(changelogContent, version) {
	// release-please formats version headers as: ## [X.Y.Z](url) (YYYY-MM-DD)
	// or ## X.Y.Z (YYYY-MM-DD)
	const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const versionHeaderPattern = new RegExp(
		`^## \\[?${escapedVersion}\\]?(?:\\([^)]*\\))?\\s*\\(([^)]+)\\)`,
		'm'
	);

	const match = changelogContent.match(versionHeaderPattern);
	if (!match) {
		return { entries: [], date: null };
	}

	const date = match[1].trim();
	const startIndex = match.index + match[0].length;

	// Find the next version header or end of file
	const nextHeaderMatch = changelogContent.slice(startIndex).match(/^## /m);
	const sectionContent = nextHeaderMatch
		? changelogContent.slice(startIndex, startIndex + nextHeaderMatch.index)
		: changelogContent.slice(startIndex);

	// Extract bullet points (lines starting with * or -)
	const entries = sectionContent
		.split('\n')
		.filter(line => /^\s*\*\s/.test(line))
		.map(line => line.replace(/^\s*\*\s+/, '').trim())
		.filter(Boolean);

	return { entries, date };
}

/**
 * Escape XML special characters in text content.
 */
function escapeXml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Build an XML <release> block.
 */
function buildReleaseXml(version, date, entries) {
	const listItems = entries.map(entry => `          <li>${escapeXml(entry)}</li>`).join('\n');
	return `    <release version="${version}" date="${date}">
      <description>
        <ul>
${listItems}
        </ul>
      </description>
    </release>`;
}

/**
 * Insert a new release entry into the appdata.xml content,
 * right after the <releases> tag. If the version already exists,
 * replace its entry.
 */
function insertRelease(appdataContent, version, releaseXml) {
	// Check if this version already exists and remove it
	const existingPattern = new RegExp(
		`\\s*<release version="${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</release>`,
		'g'
	);
	const cleaned = appdataContent.replace(existingPattern, '');

	// Insert after <releases> tag
	return cleaned.replace(
		/(<releases>)\s*/,
		`$1\n${releaseXml}\n`
	);
}

// Main
const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const version = pkg.version;

if (!fs.existsSync(CHANGELOG_PATH)) {
	console.log('No CHANGELOG.md found, skipping appdata.xml update');
	process.exit(0);
}

const changelogContent = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const { entries, date } = extractChangelogEntries(changelogContent, version);

if (entries.length === 0) {
	console.log(`No changelog entries found for version ${version}, skipping appdata.xml update`);
	process.exit(0);
}

const releaseDate = date || new Date().toISOString().split('T')[0];
const releaseXml = buildReleaseXml(version, releaseDate, entries);

const appdataContent = fs.readFileSync(APPDATA_PATH, 'utf8');
const updatedContent = insertRelease(appdataContent, version, releaseXml);

fs.writeFileSync(APPDATA_PATH, updatedContent);
console.log(`Updated appdata.xml with ${entries.length} entries for v${version} (${releaseDate})`);

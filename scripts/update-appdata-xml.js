#!/usr/bin/env node

/**
 * Update appdata.xml with release entry from CHANGELOG.md
 *
 * Reads the latest release version from package.json and the corresponding
 * changelog entries from CHANGELOG.md, then inserts a new <release> entry
 * into the appdata.xml file.
 *
 * Called by the release-please workflow after the Release PR is created/updated.
 *
 * Usage:
 *   node scripts/update-appdata-xml.js
 */

const fs = require('node:fs');
const path = require('node:path');
const xml2js = require('xml2js');

const ROOT = path.join(__dirname, '..');
const APPDATA_PATH = path.join(ROOT, 'com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

function escapeRegex(str) {
	return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Convert a release-please CHANGELOG bullet into plain text suitable for an
 * AppStream <li>. release-please emits lines like:
 *   **auth:** narrow X ([#2460](.../issues/2460)) ([93830a6](.../commit/...))
 * AppStream consumers (Flathub, GNOME Software, KDE Discover) render <li>
 * content as-is, so markdown bold/link syntax must be flattened first.
 */
function stripMarkdown(line) {
	return line
		.replace(/\[([^\]]{1,200})\]\([^)]{1,500}\)/g, '$1')
		.replace(/\*\*([^*]{1,200})\*\*/g, '$1')
		.trim()
		.replace(/\s+\([0-9a-f]{7,40}\)$/, '');
}

/**
 * Extract changelog entries for a specific version from CHANGELOG.md.
 * release-please formats headers as: ## [X.Y.Z](url) (YYYY-MM-DD)
 */
function extractChangelogEntries(changelogContent, version) {
	const versionHeaderPattern = new RegExp(
		String.raw`^## \[?${escapeRegex(version)}\]?(?:\([^)]*\))?\s*\(([^)]+)\)`,
		'm'
	);

	const match = changelogContent.match(versionHeaderPattern);
	if (!match) {
		return { entries: [], date: null };
	}

	const date = match[1].trim();
	const startIndex = match.index + match[0].length;

	const nextHeaderMatch = changelogContent.slice(startIndex).match(/^## /m);
	const sectionContent = nextHeaderMatch
		? changelogContent.slice(startIndex, startIndex + nextHeaderMatch.index)
		: changelogContent.slice(startIndex);

	const entries = sectionContent
		.split('\n')
		.filter(line => /^\s*[*-]\s/.test(line))
		.map(line => line.replace(/^\s*[*-]\s+/, '').trim())
		.map(stripMarkdown)
		.filter(Boolean);

	return { entries, date };
}

async function main() {
	const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
	const version = pkg.version;

	let changelogContent;
	try {
		changelogContent = fs.readFileSync(CHANGELOG_PATH, 'utf8');
	} catch (err) {
		if (err.code === 'ENOENT') {
			console.warn('No CHANGELOG.md found, skipping appdata.xml update');
			return;
		}
		throw err;
	}

	const { entries, date } = extractChangelogEntries(changelogContent, version);

	if (entries.length === 0) {
		console.info(`No changelog entries found for version ${version}, skipping appdata.xml update`);
		return;
	}

	const releaseDate = date || new Date().toISOString().split('T')[0];

	const parser = new xml2js.Parser();
	const appdataContent = fs.readFileSync(APPDATA_PATH, 'utf8');
	const appdata = await parser.parseStringPromise(appdataContent);

	if (!appdata.component.releases) {
		appdata.component.releases = [{ release: [] }];
	}
	if (!appdata.component.releases[0].release) {
		appdata.component.releases[0].release = [];
	}

	const releases = appdata.component.releases[0].release;

	// Remove existing entry for this version (idempotent)
	const existingIndex = releases.findIndex(r => r?.$?.version === version);
	if (existingIndex !== -1) {
		releases.splice(existingIndex, 1);
	}

	// Insert new release at the top
	const newRelease = {
		$: { version, date: releaseDate },
		description: [{ ul: [{ li: entries }] }]
	};
	releases.unshift(newRelease);

	const builder = new xml2js.Builder();
	fs.writeFileSync(APPDATA_PATH, builder.buildObject(appdata));
	console.info(`Updated appdata.xml with ${entries.length} entries for v${version} (${releaseDate})`);
}

main().catch(err => {
	console.error('Error:', err.message);
	process.exit(1);
});

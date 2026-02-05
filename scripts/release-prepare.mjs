#!/usr/bin/env node

/**
 * Release Preparation Script
 *
 * Consumes changelog files from .changelog/ directory and:
 * 1. Generates appdata.xml release entry
 * 2. Prompts for version bump
 * 3. Updates package.json and package-lock.json
 * 4. Deletes consumed changelog files
 * 5. Shows summary for review
 *
 * Usage:
 *   npm run release:prepare [version] [--dry-run]
 *
 * Examples:
 *   npm run release:prepare patch           # Bump patch version
 *   npm run release:prepare 2.8.0           # Set specific version
 *   npm run release:prepare patch --dry-run # Preview without changes
 *   npm run release:prepare -- --dry-run    # Preview with prompted version
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';
import xml2js from 'xml2js';
import { generateReleaseNotes, formatMarkdown } from './generateReleaseNotes.mjs';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');
const versionArg = args.find(a => !a.startsWith('-'));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

/**
 * Load changelog entries from .changelog directory
 */
function loadChangelogEntries() {
  const changelogDir = path.join(process.cwd(), '.changelog');
  if (!fs.existsSync(changelogDir)) {
    return { error: 'No .changelog/ directory found' };
  }
  const files = fs.readdirSync(changelogDir).filter(f => f.endsWith('.txt'));
  if (files.length === 0) {
    return { error: 'No changelog entries found in .changelog/' };
  }
  const entries = files.map(file => {
    const content = fs.readFileSync(path.join(changelogDir, file), 'utf8').trim();
    console.log(`   • ${content}`);
    return content;
  });
  return { files, entries, changelogDir };
}

/**
 * Calculate new version from bump type
 */
function calculateVersion(currentVersion, bumpType) {
  if (/^\d+\.\d+\.\d+$/.test(bumpType)) {
    return bumpType;
  }
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  const bumpMap = {
    major: `${major + 1}.0.0`,
    minor: `${major}.${minor + 1}.0`,
    patch: `${major}.${minor}.${patch + 1}`,
    p: `${major}.${minor}.${patch + 1}`,
    '': `${major}.${minor}.${patch + 1}`
  };
  return bumpMap[bumpType.toLowerCase()] || null;
}

/**
 * Prepare appdata release entry
 */
async function prepareAppdataRelease(entries, newVersion) {
  const appdataPath = path.join(process.cwd(), 'com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
  const appdataXml = fs.readFileSync(appdataPath, 'utf8');
  const parser = new xml2js.Parser();
  const appdata = await parser.parseStringPromise(appdataXml);
  const releaseDate = new Date().toISOString().split('T')[0];

  const newRelease = {
    $: { version: newVersion, date: releaseDate },
    description: [{ ul: [{ li: entries }] }]
  };

  if (!appdata.component.releases) {
    appdata.component.releases = [{ release: [] }];
  }
  if (!appdata.component.releases[0].release) {
    appdata.component.releases[0].release = [];
  }
  appdata.component.releases[0].release.unshift(newRelease);

  const builder = new xml2js.Builder();
  return { updatedXml: builder.buildObject(appdata), appdataPath, releaseDate };
}

/**
 * Show dry-run preview of changes
 */
function showDryRunPreview(currentVersion, newVersion, releaseDate, files) {
  console.log('\n📝 Files that WOULD be updated:\n');
  console.log('   📄 package.json');
  console.log(`      version: "${currentVersion}" → "${newVersion}"`);
  console.log('\n   📄 package-lock.json\n      (via npm install)');
  console.log('\n   📄 com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
  console.log(`      New release entry: v${newVersion} (${releaseDate})\n`);
  console.log('   🗑️  Changelog files to delete:');
  files.forEach(file => console.log(`      • .changelog/${file}`));
}

/**
 * Apply all release changes
 */
function applyChanges(pkg, pkgPath, newVersion, updatedXml, appdataPath, files, changelogDir) {
  console.log('\n📝 Updating files...');
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('   ✅ Updated package.json');

  console.log('   ⏳ Running npm install...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('   ✅ Updated package-lock.json');

  fs.writeFileSync(appdataPath, updatedXml);
  console.log('   ✅ Updated appdata.xml');

  files.forEach(file => fs.unlinkSync(path.join(changelogDir, file)));
  console.log(`   ✅ Deleted ${files.length} changelog files`);
}

/**
 * Show release notes preview
 */
function showReleaseNotesPreview(newVersion, headerText) {
  console.log('\n' + '═'.repeat(60));
  console.log(headerText);
  console.log('═'.repeat(60) + '\n');
  const releaseNotes = generateReleaseNotes();
  console.log(formatMarkdown(releaseNotes, newVersion));
  console.log('═'.repeat(60) + '\n');
}

/**
 * Show completion summary
 */
function showCompletionSummary(newVersion, fileCount) {
  console.log('\n✅ Release v' + newVersion + ' prepared!');
  console.log('\n📝 File Changes:');
  console.log('   • package.json → ' + newVersion);
  console.log('   • package-lock.json → ' + newVersion);
  console.log('   • appdata.xml → new release entry');
  console.log('   • .changelog/ → ' + fileCount + ' files deleted');
}

/**
 * Show next steps for release
 */
function showNextSteps(newVersion) {
  console.log('📋 Next steps:');
  console.log(`   git checkout -b release/v${newVersion}`);
  console.log(`   git add .`);
  console.log(`   git commit -m "chore: release v${newVersion}"`);
  console.log(`   git push -u origin release/v${newVersion}`);
  console.log(`   gh pr create --title "Release v${newVersion}" --body-file <(npm run generate-release-notes ${newVersion})`);
}

// Main function
async function main() {
  if (dryRun) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      DRY RUN MODE                          ║');
    console.log('║         No files will be modified. Preview only.           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  }

  console.log('🚀 Release Preparation\n');

  const changelog = loadChangelogEntries();
  if (changelog.error) {
    console.log(`❌ ${changelog.error}`);
    process.exit(1);
  }
  const { files, entries, changelogDir } = changelog;
  console.log(`\n📋 Found ${files.length} changelog entries:\n`);

  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  console.log(`📦 Current version: ${currentVersion}`);

  let versionAnswer = versionArg;
  if (versionAnswer) {
    console.log(`🔢 Version bump: ${versionAnswer}`);
  } else {
    versionAnswer = await question('\n🔢 Version bump (patch/minor/major or specific version): ');
  }

  const newVersion = calculateVersion(currentVersion, versionAnswer);
  if (!newVersion) {
    console.log(`❌ Invalid bump type: ${versionAnswer}`);
    process.exit(1);
  }
  console.log(`   New version: ${newVersion}\n`);

  const { updatedXml, appdataPath, releaseDate } = await prepareAppdataRelease(entries, newVersion);

  if (dryRun) {
    showDryRunPreview(currentVersion, newVersion, releaseDate, files);
    showReleaseNotesPreview(newVersion, '📋 RELEASE NOTES PREVIEW (generated from current changelog)');
    console.log('ℹ️  This was a DRY RUN. No files were modified.');
    console.log('   Run without --dry-run to apply changes.\n');
  } else {
    applyChanges(pkg, pkgPath, newVersion, updatedXml, appdataPath, files, changelogDir);
    showCompletionSummary(newVersion, files.length);
    showReleaseNotesPreview(newVersion, '📋 RELEASE NOTES PREVIEW');
    showNextSteps(newVersion);
  }

  rl.close();
}

// Top-level await (ESM)
try {
  await main();
} catch (err) {
  console.error('\n❌ Error:', err.message);
  rl.close();
  process.exit(1);
}

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

// Main function
async function main() {
  if (dryRun) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      DRY RUN MODE                          ║');
    console.log('║         No files will be modified. Preview only.           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  }

  console.log('🚀 Release Preparation\n');

  // 1. Check for changelog files
  const changelogDir = path.join(process.cwd(), '.changelog');

  if (!fs.existsSync(changelogDir)) {
    console.log('❌ No .changelog/ directory found');
    process.exit(1);
  }

  const files = fs.readdirSync(changelogDir).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    console.log('❌ No changelog entries found in .changelog/');
    process.exit(1);
  }

  console.log(`📋 Found ${files.length} changelog entries:\n`);

  // 2. Read all changelog entries
  const entries = files.map(file => {
    const content = fs.readFileSync(path.join(changelogDir, file), 'utf8').trim();
    console.log(`   • ${content}`);
    return content;
  });

  console.log('');

  // 3. Get current version
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;

  console.log(`📦 Current version: ${currentVersion}`);

  // 4. Get version bump from args or prompt
  let versionAnswer = versionArg;

  if (versionAnswer) {
    console.log(`🔢 Version bump: ${versionAnswer}`);
  } else {
    versionAnswer = await question('\n🔢 Version bump (patch/minor/major or specific version): ');
  }

  let newVersion;
  if (versionAnswer.match(/^\d+\.\d+\.\d+$/)) {
    newVersion = versionAnswer;
  } else {
    // Calculate new version based on bump type
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    switch (versionAnswer.toLowerCase()) {
      case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
      case 'patch':
      case 'p':
      case '':
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
      default:
        console.log(`❌ Invalid bump type: ${versionAnswer}`);
        process.exit(1);
    }
  }

  console.log(`   New version: ${newVersion}\n`);

  // 5. Generate appdata.xml entry
  const appdataPath = path.join(process.cwd(), 'com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
  const appdataXml = fs.readFileSync(appdataPath, 'utf8');

  const parser = new xml2js.Parser();
  const appdata = await parser.parseStringPromise(appdataXml);

  // Create new release entry
  const releaseDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const newRelease = {
    $: {
      version: newVersion,
      date: releaseDate
    },
    description: [{
      ul: [{
        li: entries
      }]
    }]
  };

  // Add to top of releases list
  if (!appdata.component.releases) {
    appdata.component.releases = [{ release: [] }];
  }
  if (!appdata.component.releases[0].release) {
    appdata.component.releases[0].release = [];
  }

  appdata.component.releases[0].release.unshift(newRelease);

  // Build XML
  const builder = new xml2js.Builder();
  const updatedXml = builder.buildObject(appdata);

  // 6. Update files (or show what would be updated in dry-run mode)
  if (dryRun) {
    console.log('\n📝 Files that WOULD be updated:\n');
    console.log('   📄 package.json');
    console.log(`      version: "${currentVersion}" → "${newVersion}"`);
    console.log('');
    console.log('   📄 package-lock.json');
    console.log(`      (via npm install)`);
    console.log('');
    console.log('   📄 com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
    console.log(`      New release entry: v${newVersion} (${releaseDate})`);
    console.log('');
    console.log('   🗑️  Changelog files to delete:');
    for (const file of files) {
      console.log(`      • .changelog/${file}`);
    }
  } else {
    console.log('\n📝 Updating files...');

    // Update package.json
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('   ✅ Updated package.json');

    // Update package-lock.json via npm install
    console.log('   ⏳ Running npm install...');

    try {
      execSync('npm install', {
        stdio: 'inherit'
      });
      console.log('   ✅ Updated package-lock.json');
    } catch (err) {
      console.error('   ❌ npm install failed:');
      console.error('   Exit code:', err.status);
      console.error('   Signal:', err.signal);
      throw err;
    }

    // Update appdata.xml
    fs.writeFileSync(appdataPath, updatedXml);
    console.log('   ✅ Updated appdata.xml');

    // Delete changelog files
    for (const file of files) {
      fs.unlinkSync(path.join(changelogDir, file));
    }
    console.log(`   ✅ Deleted ${files.length} changelog files`);
  }

  // 7. Summary
  if (dryRun) {
    console.log('\n' + '═'.repeat(60));
    console.log('📋 RELEASE NOTES PREVIEW (generated from current changelog)');
    console.log('═'.repeat(60) + '\n');

    // Use the full release notes generator for dry-run
    const releaseNotes = generateReleaseNotes();
    const formattedNotes = formatMarkdown(releaseNotes, newVersion);
    console.log(formattedNotes);

    console.log('═'.repeat(60) + '\n');
    console.log('ℹ️  This was a DRY RUN. No files were modified.');
    console.log('   Run without --dry-run to apply changes.\n');
  } else {
    console.log('\n✅ Release v' + newVersion + ' prepared!');
    console.log('\n📝 File Changes:');
    console.log('   • package.json → ' + newVersion);
    console.log('   • package-lock.json → ' + newVersion);
    console.log('   • appdata.xml → new release entry');
    console.log('   • .changelog/ → ' + files.length + ' files deleted');

    // Generate enhanced release notes summary (reuse shared logic)
    console.log('\n' + '═'.repeat(60));
    console.log('📋 RELEASE NOTES PREVIEW');
    console.log('═'.repeat(60) + '\n');

    const releaseNotes = generateReleaseNotes();
    const formattedNotes = formatMarkdown(releaseNotes, newVersion);
    console.log(formattedNotes);

    console.log('═'.repeat(60) + '\n');

    console.log('📋 Next steps:');
    console.log(`   git checkout -b release/v${newVersion}`);
    console.log(`   git add .`);
    console.log(`   git commit -m "chore: release v${newVersion}"`);
    console.log(`   git push -u origin release/v${newVersion}`);
    console.log(`   gh pr create --title "Release v${newVersion}" --body-file <(npm run generate-release-notes ${newVersion})`);
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

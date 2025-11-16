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
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const readline = require('node:readline');
const xml2js = require('xml2js');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🚀 Release Preparation\n');

  // 1. Check for changelog files
  const changelogDir = path.join(process.cwd(), '.changelog');

  if (!fs.existsSync(changelogDir)) {
    console.log('❌ No .changelog/ directory found');
    console.log('   Nothing to release - merge some PRs first!');
    process.exit(1);
  }

  const files = fs.readdirSync(changelogDir).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    console.log('❌ No changelog entries found in .changelog/');
    console.log('   Nothing to release - merge some PRs first!');
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

  // 4. Prompt for new version
  const versionAnswer = await question('\n🔢 Version bump (patch/minor/major or specific version): ');

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
  console.log('📝 Generating appdata.xml entry...');

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

  // 6. Show summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Ready to Release v${newVersion.padEnd(43)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Changelog:                                              ║');
  entries.forEach(entry => {
    const truncated = entry.length > 52 ? entry.substring(0, 49) + '...' : entry;
    console.log(`║  • ${truncated.padEnd(53)}║`);
  });
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Files to be modified:                                   ║');
  console.log('║    • package.json                                        ║');
  console.log('║    • package-lock.json                                   ║');
  console.log('║    • com.github.IsmaelMartinez.teams_for_linux.appdata.xml║');
  console.log(`║    • .changelog/ (${files.length} files will be deleted)${' '.repeat(Math.max(0, 20 - files.length.toString().length))}║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const confirm = await question('Continue? (y/n): ');

  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('\n❌ Aborted - no changes made');
    rl.close();
    process.exit(0);
  }

  // 7. Update files
  console.log('\n📝 Updating files...');

  // Update package.json
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('   ✅ Updated package.json');

  // Update package-lock.json via npm install
  console.log('   ⏳ Running npm install...');
  // Use only safe system directories in PATH to prevent command injection
  const safePath = '/usr/bin:/bin';
  execSync('npm install', {
    stdio: 'ignore',
    env: { ...process.env, PATH: safePath },
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
  });
  console.log('   ✅ Updated package-lock.json');

  // Update appdata.xml
  fs.writeFileSync(appdataPath, updatedXml);
  console.log('   ✅ Updated appdata.xml');

  // Delete changelog files
  files.forEach(file => {
    fs.unlinkSync(path.join(changelogDir, file));
  });
  console.log(`   ✅ Deleted ${files.length} changelog files`);

  // 8. Final instructions
  console.log('\n✅ Release prepared successfully!');
  console.log('\n📋 Next steps:');
  console.log('   1. Review the changes:');
  console.log('      git diff');
  console.log('');
  console.log('   2. Commit the release:');
  console.log(`      git add .`);
  console.log(`      git commit -m "chore: release v${newVersion}"`);
  console.log('');
  console.log('   3. Push to main:');
  console.log('      git push origin main');
  console.log('');
  console.log('   4. Version change will trigger build automatically');
  console.log('      → GitHub draft release');
  console.log('      → Snap edge channel');
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  rl.close();
  process.exit(1);
});

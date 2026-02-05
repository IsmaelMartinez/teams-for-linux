#!/usr/bin/env node

/**
 * Generate Enhanced Release Notes
 *
 * Reads changelog entries from .changelog/ directory and generates:
 * 1. Categorized changes (Features, Fixes, Documentation, etc.)
 * 2. Auto-detected configuration option changes with links
 * 3. Electron version update detection with release notes links
 *
 * This script dynamically parses docs/configuration.md to detect config options,
 * requiring no manual maintenance of keyword mappings.
 */

import fs from 'node:fs';
import path from 'node:path';

// Documentation base URL
const DOCS_BASE_URL = 'https://ismaelmartinez.github.io/teams-for-linux';

// Change type prefixes and their categories
const CHANGE_TYPES = {
  feat: { label: 'New Features', emoji: '🚀' },
  fix: { label: 'Bug Fixes', emoji: '🐛' },
  docs: { label: 'Documentation', emoji: '📚' },
  chore: { label: 'Maintenance', emoji: '🔧' },
  refactor: { label: 'Code Improvements', emoji: '♻️' },
  perf: { label: 'Performance', emoji: '⚡' },
  ci: { label: 'CI/CD', emoji: '🔄' },
  test: { label: 'Testing', emoji: '🧪' },
  security: { label: 'Security', emoji: '🔒' },
  deps: { label: 'Dependencies', emoji: '📦' }
};

/**
 * Extract all configuration option names from configuration.md
 * Parses markdown tables to find option names in backticks
 */
function extractConfigOptions(docsPath) {
  const configPath = path.join(docsPath, 'configuration.md');

  if (!fs.existsSync(configPath)) {
    return { options: new Set(), sections: new Map() };
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const options = new Set();
  const sections = new Map(); // option -> section anchor

  // Track current section
  let currentSection = '';
  let currentAnchor = '';

  const lines = content.split('\n');

  for (const line of lines) {
    // Track markdown headings for section context
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      // Convert to anchor format: "Window & UI Behavior" -> "window--ui-behavior"
      currentAnchor = currentSection
        .toLowerCase()
        .replace(/[&]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    // Match table rows with option names in backticks
    // Format: | `optionName` | type | default | description |
    const tableMatch = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (tableMatch) {
      const optionName = tableMatch[1];
      // Skip header row markers
      if (optionName !== 'Option' && !optionName.includes('-')) {
        options.add(optionName);
        // Also add the base name for nested options (e.g., "auth" from "auth.intune.enabled")
        const baseName = optionName.split('.')[0];
        options.add(baseName);
        sections.set(optionName, currentAnchor);
        sections.set(baseName, currentAnchor);
      }
    }
  }

  return { options, sections };
}

/**
 * Detect Electron version from changelog entry
 * Returns version string if found, null otherwise
 */
function detectElectronVersion(entry) {
  const lower = entry.toLowerCase();

  // Match patterns like "electron 39", "electron v39", "electron 39.4.0", "electron to 39"
  const versionMatch = entry.match(/electron\s*(?:to\s*)?v?(\d+(?:\.\d+(?:\.\d+)?)?)/i);
  if (versionMatch) {
    return versionMatch[1];
  }

  // Check if it mentions electron upgrade/update
  if (lower.includes('electron') && (lower.includes('upgrade') || lower.includes('update') || lower.includes('bump'))) {
    return 'latest';
  }

  return null;
}

/**
 * Detect configuration options mentioned in an entry
 */
function detectConfigOptions(entry, knownOptions, sections) {
  const mentioned = [];
  const lowerEntry = entry.toLowerCase();

  for (const option of knownOptions) {
    // Check for exact option name (case insensitive)
    if (lowerEntry.includes(option.toLowerCase())) {
      const section = sections.get(option);
      if (section && !mentioned.some(m => m.option === option)) {
        mentioned.push({ option, section });
      }
    }
  }

  // Also detect common config-related keywords
  const configKeywords = [
    { pattern: /\bconfig(?:uration)?\b/i, hint: 'configuration options' },
    { pattern: /\boption(?:s)?\b/i, hint: 'configuration options' },
    { pattern: /\bdeprecate(?:d|s)?\b/i, hint: 'deprecated options' },
    { pattern: /\bdefault(?:s)?\b/i, hint: 'default values' }
  ];

  for (const { pattern, hint } of configKeywords) {
    if (pattern.test(entry)) {
      mentioned.push({ option: null, hint });
      break; // Only add one generic hint
    }
  }

  return mentioned;
}

/**
 * Parse a changelog entry and extract type and description
 */
function parseEntry(entry) {
  const normalized = entry.trim();

  // Try to match conventional commit format: type(scope): description
  const conventionalMatch = normalized.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)/i);
  if (conventionalMatch) {
    const [, type, desc] = conventionalMatch;
    return { type: type.toLowerCase(), description: desc.trim(), original: normalized };
  }

  // Try to match bracket format: [Type]: description
  const bracketMatch = normalized.match(/^\[([^\]]+)\]:\s*(.+)/i);
  if (bracketMatch) {
    const [, type, desc] = bracketMatch;
    return { type: type.toLowerCase(), description: desc.trim(), original: normalized };
  }

  // Try to match prefix keywords
  const lowerEntry = normalized.toLowerCase();
  for (const prefix of Object.keys(CHANGE_TYPES)) {
    if (lowerEntry.startsWith(prefix)) {
      return { type: prefix, description: normalized, original: normalized };
    }
  }

  // Heuristic classification based on content
  if (lowerEntry.includes('add ') || lowerEntry.includes('implement') || lowerEntry.includes('feature')) {
    return { type: 'feat', description: normalized, original: normalized };
  }
  if (lowerEntry.includes('fix') || lowerEntry.includes('resolve') || lowerEntry.includes('correct')) {
    return { type: 'fix', description: normalized, original: normalized };
  }
  if (lowerEntry.includes('doc') || lowerEntry.includes('readme') || lowerEntry.includes('research')) {
    return { type: 'docs', description: normalized, original: normalized };
  }
  if (lowerEntry.includes('upgrade') || lowerEntry.includes('bump') || lowerEntry.includes('update dep')) {
    return { type: 'deps', description: normalized, original: normalized };
  }
  if (lowerEntry.includes('refactor') || lowerEntry.includes('cleanup') || lowerEntry.includes('reorganize')) {
    return { type: 'refactor', description: normalized, original: normalized };
  }

  // Default to maintenance
  return { type: 'chore', description: normalized, original: normalized };
}

/**
 * Generate enhanced release notes from changelog entries
 */
export function generateReleaseNotes(changelogDir = '.changelog') {
  const fullPath = path.isAbsolute(changelogDir)
    ? changelogDir
    : path.join(process.cwd(), changelogDir);

  if (!fs.existsSync(fullPath)) {
    return { error: 'No .changelog/ directory found' };
  }

  const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    return { error: 'No changelog entries found in .changelog/' };
  }

  // Extract known config options from docs
  const docsPath = path.join(process.cwd(), 'docs-site', 'docs');
  const { options: knownOptions, sections } = extractConfigOptions(docsPath);

  // Read and parse all entries
  const entries = files.map(file => {
    const content = fs.readFileSync(path.join(fullPath, file), 'utf8').trim();
    const parsed = parseEntry(content);

    // Detect special content
    parsed.electronVersion = detectElectronVersion(content);
    parsed.configOptions = detectConfigOptions(content, knownOptions, sections);

    return parsed;
  });

  // Categorize entries
  const categorized = {};
  for (const entry of entries) {
    const category = CHANGE_TYPES[entry.type] || CHANGE_TYPES.chore;
    const key = entry.type;

    if (!categorized[key]) {
      categorized[key] = {
        ...category,
        entries: []
      };
    }
    categorized[key].entries.push(entry);
  }

  // Collect detected links
  const detectedLinks = {
    electron: null,
    configSections: new Set()
  };

  for (const entry of entries) {
    if (entry.electronVersion) {
      detectedLinks.electron = entry.electronVersion;
    }
    for (const opt of entry.configOptions) {
      if (opt.section) {
        detectedLinks.configSections.add(opt.section);
      }
    }
  }

  return {
    total: entries.length,
    categorized,
    detectedLinks,
    entries
  };
}

/**
 * Format release notes as markdown
 */
export function formatMarkdown(releaseNotes, version = 'X.X.X') {
  if (releaseNotes.error) {
    return `Error: ${releaseNotes.error}`;
  }

  const lines = [];

  lines.push(`## What's Changed in v${version}\n`);

  // Priority order for categories
  const categoryOrder = ['feat', 'fix', 'security', 'perf', 'refactor', 'docs', 'deps', 'ci', 'test', 'chore'];

  // Output categorized changes
  for (const key of categoryOrder) {
    const category = releaseNotes.categorized[key];
    if (!category) continue;

    lines.push(`### ${category.emoji} ${category.label}\n`);

    for (const entry of category.entries) {
      lines.push(`- ${entry.original}`);
    }
    lines.push('');
  }

  // Add documentation links section
  const { detectedLinks } = releaseNotes;
  const hasLinks = detectedLinks.electron || detectedLinks.configSections.size > 0;

  if (hasLinks) {
    lines.push('---\n');
    lines.push('### 📖 Related Documentation\n');

    // Electron release notes
    if (detectedLinks.electron) {
      const electronVersion = detectedLinks.electron === 'latest' ? '' : `v${detectedLinks.electron}`;
      if (electronVersion) {
        // Link to specific version
        const majorVersion = electronVersion.split('.')[0].replace('v', '');
        lines.push(`- [Electron ${electronVersion} Release Notes](https://releases.electronjs.org/release/${electronVersion.replace('v', 'v')})`);
        lines.push(`  - See [Electron ${majorVersion}.x blog post](https://www.electronjs.org/blog/electron-${majorVersion}-0) for major features`);
      } else {
        lines.push(`- [Electron Releases](https://releases.electronjs.org/)`);
      }
    }

    // Config sections
    if (detectedLinks.configSections.size > 0) {
      lines.push(`- Configuration changes in this release:`);
      for (const section of detectedLinks.configSections) {
        // Convert anchor back to readable name
        const readable = section
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        lines.push(`  - [${readable}](${DOCS_BASE_URL}/configuration#${section})`);
      }
    }

    lines.push('');
  }

  // Add quick reference footer
  lines.push('---\n');
  lines.push('**Quick Links:**');
  lines.push(`- [Configuration Reference](${DOCS_BASE_URL}/configuration) - All options with defaults`);
  lines.push(`- [Troubleshooting](${DOCS_BASE_URL}/troubleshooting) - Common issues and solutions`);
  lines.push(`- [Installation Guide](${DOCS_BASE_URL}/installation) - Setup instructions\n`);

  return lines.join('\n');
}

/**
 * Format release notes as concise summary for PR body
 */
export function formatSummary(releaseNotes, version = 'X.X.X') {
  if (releaseNotes.error) {
    return `Error: ${releaseNotes.error}`;
  }

  const lines = [];
  const categoryOrder = ['feat', 'fix', 'security', 'perf', 'refactor', 'docs', 'deps', 'ci', 'test', 'chore'];

  // Count by category
  const counts = [];
  for (const key of categoryOrder) {
    const category = releaseNotes.categorized[key];
    if (category) {
      counts.push(`${category.entries.length} ${category.label.toLowerCase()}`);
    }
  }

  lines.push(`## Release v${version}\n`);
  lines.push(`This release includes **${releaseNotes.total} changes**: ${counts.join(', ')}.\n`);

  // Highlight features if any
  const features = releaseNotes.categorized.feat;
  if (features && features.entries.length > 0) {
    lines.push('### Highlights\n');
    for (const entry of features.entries.slice(0, 5)) {
      lines.push(`- ${entry.original}`);
    }
    if (features.entries.length > 5) {
      lines.push(`- ...and ${features.entries.length - 5} more features`);
    }
    lines.push('');
  }

  // Highlight fixes if any
  const fixes = releaseNotes.categorized.fix;
  if (fixes && fixes.entries.length > 0) {
    lines.push('### Bug Fixes\n');
    for (const entry of fixes.entries.slice(0, 5)) {
      lines.push(`- ${entry.original}`);
    }
    if (fixes.entries.length > 5) {
      lines.push(`- ...and ${fixes.entries.length - 5} more fixes`);
    }
    lines.push('');
  }

  // Documentation links
  const { detectedLinks } = releaseNotes;
  if (detectedLinks.electron || detectedLinks.configSections.size > 0) {
    lines.push('### 📖 Related Documentation\n');

    if (detectedLinks.electron && detectedLinks.electron !== 'latest') {
      lines.push(`- [Electron v${detectedLinks.electron} Release Notes](https://releases.electronjs.org/release/v${detectedLinks.electron})`);
    }

    if (detectedLinks.configSections.size > 0) {
      lines.push(`- [Configuration Reference](${DOCS_BASE_URL}/configuration)`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// CLI mode when run directly
const isMain = process.argv[1] && (
  process.argv[1].endsWith('generateReleaseNotes.mjs') ||
  process.argv[1].endsWith('generateReleaseNotes.js')
);

if (isMain) {
  const args = process.argv.slice(2);
  const version = args.find(a => a.match(/^\d+\.\d+\.\d+$/)) || 'X.X.X';
  const format = args.includes('--summary') ? 'summary' : 'full';
  const json = args.includes('--json');

  const releaseNotes = generateReleaseNotes();

  if (json) {
    // Convert Sets to arrays for JSON serialization
    const jsonSafe = {
      ...releaseNotes,
      detectedLinks: releaseNotes.detectedLinks ? {
        electron: releaseNotes.detectedLinks.electron,
        configSections: Array.from(releaseNotes.detectedLinks.configSections || [])
      } : null
    };
    console.log(JSON.stringify(jsonSafe, null, 2));
  } else if (format === 'summary') {
    console.log(formatSummary(releaseNotes, version));
  } else {
    console.log(formatMarkdown(releaseNotes, version));
  }
}

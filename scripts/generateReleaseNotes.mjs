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

// Priority order for categories in output
const CATEGORY_ORDER = ['feat', 'fix', 'security', 'perf', 'refactor', 'docs', 'deps', 'ci', 'test', 'chore'];

// Heuristics for classifying entries without conventional commit prefixes
const CLASSIFICATION_HEURISTICS = [
  { type: 'feat', keywords: ['add ', 'implement', 'feature'] },
  { type: 'fix', keywords: ['fix', 'resolve', 'correct'] },
  { type: 'docs', keywords: ['doc', 'readme', 'research'] },
  { type: 'deps', keywords: ['upgrade', 'bump', 'update dep'] },
  { type: 'refactor', keywords: ['refactor', 'cleanup', 'reorganize'] }
];

/**
 * Convert section title to anchor format
 */
function toAnchor(section) {
  return section
    .toLowerCase()
    .replaceAll('&', '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(?:^-|-$)/g, '');
}

/**
 * Extract all configuration option names from configuration.md
 */
function extractConfigOptions(docsPath) {
  const configPath = path.join(docsPath, 'configuration.md');

  if (!fs.existsSync(configPath)) {
    return { options: new Set(), sections: new Map() };
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const options = new Set();
  const sections = new Map();
  let currentAnchor = '';

  for (const line of content.split('\n')) {
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      currentAnchor = toAnchor(headingMatch[1].trim());
      continue;
    }

    const tableMatch = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (tableMatch) {
      const optionName = tableMatch[1];
      if (optionName !== 'Option' && !optionName.includes('-')) {
        options.add(optionName);
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
 */
function detectElectronVersion(entry) {
  const versionMatch = entry.match(/electron\s*(?:to\s*)?v?(\d+(?:\.\d+(?:\.\d+)?)?)/i);
  if (versionMatch) {
    return versionMatch[1];
  }

  const lower = entry.toLowerCase();
  if (lower.includes('electron') && /upgrade|update|bump/.test(lower)) {
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
    if (lowerEntry.includes(option.toLowerCase())) {
      const section = sections.get(option);
      if (section && !mentioned.some(m => m.option === option)) {
        mentioned.push({ option, section });
      }
    }
  }

  // Detect config-related keywords
  const configPatterns = [
    { pattern: /\bconfig(?:uration)?\b/i, hint: 'configuration options' },
    { pattern: /\boptions?\b/i, hint: 'configuration options' },
    { pattern: /\bdeprecated?s?\b/i, hint: 'deprecated options' },
    { pattern: /\bdefaults?\b/i, hint: 'default values' }
  ];

  for (const { pattern, hint } of configPatterns) {
    if (pattern.test(entry)) {
      mentioned.push({ option: null, hint });
      break;
    }
  }

  return mentioned;
}

/**
 * Parse a changelog entry and extract type and description
 */
function parseEntry(entry) {
  const normalized = entry.trim();

  // Try conventional commit format: type(scope): description
  const conventionalMatch = normalized.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)/i);
  if (conventionalMatch) {
    return { type: conventionalMatch[1].toLowerCase(), description: conventionalMatch[2].trim(), original: normalized };
  }

  // Try bracket format: [Type]: description
  const bracketMatch = normalized.match(/^\[([^\]]+)\]:\s*(.+)/i);
  if (bracketMatch) {
    return { type: bracketMatch[1].toLowerCase(), description: bracketMatch[2].trim(), original: normalized };
  }

  // Try prefix keywords
  const lowerEntry = normalized.toLowerCase();
  for (const prefix of Object.keys(CHANGE_TYPES)) {
    if (lowerEntry.startsWith(prefix)) {
      return { type: prefix, description: normalized, original: normalized };
    }
  }

  // Heuristic classification
  for (const { type, keywords } of CLASSIFICATION_HEURISTICS) {
    if (keywords.some(kw => lowerEntry.includes(kw))) {
      return { type, description: normalized, original: normalized };
    }
  }

  return { type: 'chore', description: normalized, original: normalized };
}

/**
 * Load changelog entries from .changelog/*.txt files.
 * Files may contain a single line (legacy) or multiple lines where
 * additional lines starting with "closes: " carry linked issue metadata:
 *   closes: #123 https://github.com/.../issues/123 Issue title here
 */
function loadFromChangelogDir(fullPath) {
  if (!fs.existsSync(fullPath)) return null;
  const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.txt'));
  if (files.length === 0) return null;
  return files.map(file => {
    const raw = fs.readFileSync(path.join(fullPath, file), 'utf8').trim();
    const lines = raw.split(/\r?\n/).map(l => l.trim());
    const content = lines[0];
    const closingIssues = lines.slice(1)
      .filter(l => l.startsWith('closes: '))
      .map(l => {
        const parts = l.slice('closes: '.length).split(' ');
        const ref = parts[0];
        const url = parts[1];
        const title = parts.slice(2).join(' ');
        if (!ref?.startsWith('#') || !url?.startsWith('http')) return null;
        return { ref, url, title };
      })
      .filter(Boolean);
    return { content, closingIssues };
  });
}

/**
 * Fallback: load changelog entries from the latest release in appdata.xml.
 * Used when .changelog/*.txt files have already been consumed by release:prepare.
 */
function loadFromAppdataXml() {
  const appdataPath = path.join(process.cwd(), 'com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
  if (!fs.existsSync(appdataPath)) return null;

  const content = fs.readFileSync(appdataPath, 'utf8');
  const liMatches = [...content.matchAll(/<release[^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/gm)];
  if (liMatches.length === 0) return null;

  // Take only the first (latest) release block
  const items = [...liMatches[0][1].matchAll(/<li>(.*?)<\/li>/g)];
  if (items.length === 0) return null;

  return items.map(m => m[1].trim());
}

/**
 * Generate enhanced release notes from changelog entries
 */
export function generateReleaseNotes(changelogDir = '.changelog') {
  const fullPath = path.isAbsolute(changelogDir) ? changelogDir : path.join(process.cwd(), changelogDir);

  const rawEntries = loadFromChangelogDir(fullPath) || loadFromAppdataXml();
  if (!rawEntries) {
    return { error: 'No changelog entries found in .changelog/ or appdata.xml' };
  }

  const docsPath = path.join(process.cwd(), 'docs-site', 'docs');
  const { options: knownOptions, sections } = extractConfigOptions(docsPath);

  const entries = rawEntries.map(item => {
    // Support both legacy string entries (from appdata fallback) and enriched objects
    const content = typeof item === 'string' ? item : item.content;
    const closingIssues = typeof item === 'string' ? [] : (item.closingIssues || []);
    const parsed = parseEntry(content);
    parsed.electronVersion = detectElectronVersion(content);
    parsed.configOptions = detectConfigOptions(content, knownOptions, sections);
    parsed.closingIssues = closingIssues;
    return parsed;
  });

  const categorized = {};
  for (const entry of entries) {
    const key = entry.type;
    if (!categorized[key]) {
      categorized[key] = { ...(CHANGE_TYPES[key] || CHANGE_TYPES.chore), entries: [] };
    }
    categorized[key].entries.push(entry);
  }

  const detectedLinks = { electron: null, configSections: new Set() };
  for (const entry of entries) {
    if (entry.electronVersion) detectedLinks.electron = entry.electronVersion;
    for (const opt of entry.configOptions) {
      if (opt.section) detectedLinks.configSections.add(opt.section);
    }
  }

  return { total: entries.length, categorized, detectedLinks, entries };
}

/**
 * Format categorized entries as markdown list
 */
function formatCategorizedEntries(categorized) {
  const lines = [];
  for (const key of CATEGORY_ORDER) {
    const category = categorized[key];
    if (!category) continue;
    lines.push(`### ${category.emoji} ${category.label}\n`);
    category.entries.forEach(entry => {
      let line = `- ${entry.original}`;
      if (entry.closingIssues && entry.closingIssues.length > 0) {
        const links = entry.closingIssues.map(i => `[${i.ref}](${i.url})`).join(', ');
        line += ` (${links})`;
      }
      lines.push(line);
    });
    lines.push('');
  }
  return lines;
}

/**
 * Format Electron documentation links
 */
function formatElectronLinks(electronVersion) {
  if (!electronVersion) return [];
  if (electronVersion === 'latest') {
    return ['- [Electron Releases](https://releases.electronjs.org/)'];
  }
  const ver = `v${electronVersion}`;
  const major = electronVersion.split('.')[0];
  return [
    `- [Electron ${ver} Release Notes](https://releases.electronjs.org/release/${ver})`,
    `  - See [Electron ${major}.x blog post](https://www.electronjs.org/blog/electron-${major}-0) for major features`
  ];
}

/**
 * Format config section links
 */
function formatConfigLinks(configSections) {
  if (configSections.size === 0) return [];
  const lines = ['- Configuration changes in this release:'];
  for (const section of configSections) {
    const readable = section.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    lines.push(`  - [${readable}](${DOCS_BASE_URL}/configuration#${section})`);
  }
  return lines;
}

/**
 * Format quick links footer
 */
function formatQuickLinks() {
  return [
    '---\n',
    '**Quick Links:**',
    `- [Configuration Reference](${DOCS_BASE_URL}/configuration) - All options with defaults`,
    `- [Troubleshooting](${DOCS_BASE_URL}/troubleshooting) - Common issues and solutions`,
    `- [Installation Guide](${DOCS_BASE_URL}/installation) - Setup instructions\n`
  ];
}

/**
 * Format release notes as markdown
 */
export function formatMarkdown(releaseNotes, version = 'X.X.X') {
  if (releaseNotes.error) return `Error: ${releaseNotes.error}`;

  const lines = [`## What's Changed in v${version}\n`];
  lines.push(...formatCategorizedEntries(releaseNotes.categorized));

  const { detectedLinks } = releaseNotes;
  if (detectedLinks.electron || detectedLinks.configSections.size > 0) {
    lines.push(
      '---\n',
      '### 📖 Related Documentation\n',
      ...formatElectronLinks(detectedLinks.electron),
      ...formatConfigLinks(detectedLinks.configSections),
      ''
    );
  }

  lines.push(...formatQuickLinks());
  return lines.join('\n');
}

/**
 * Format highlighted entries section
 */
function formatHighlightedEntries(entries, title, maxItems = 5) {
  if (!entries || entries.length === 0) return [];
  const lines = [`### ${title}\n`];
  entries.slice(0, maxItems).forEach(entry => lines.push(`- ${entry.original}`));
  if (entries.length > maxItems) {
    lines.push(`- ...and ${entries.length - maxItems} more`);
  }
  lines.push('');
  return lines;
}

/**
 * Format release notes as concise summary for PR body
 */
export function formatSummary(releaseNotes, version = 'X.X.X') {
  if (releaseNotes.error) return `Error: ${releaseNotes.error}`;

  const counts = CATEGORY_ORDER
    .filter(key => releaseNotes.categorized[key])
    .map(key => `${releaseNotes.categorized[key].entries.length} ${releaseNotes.categorized[key].label.toLowerCase()}`);

  const lines = [
    `## Release v${version}\n`,
    `This release includes **${releaseNotes.total} changes**: ${counts.join(', ')}.\n`
  ];

  lines.push(
    ...formatHighlightedEntries(releaseNotes.categorized.feat?.entries, 'Highlights'),
    ...formatHighlightedEntries(releaseNotes.categorized.fix?.entries, 'Bug Fixes')
  );

  const { detectedLinks } = releaseNotes;
  if (detectedLinks.electron || detectedLinks.configSections.size > 0) {
    const docLinks = ['### 📖 Related Documentation\n'];
    if (detectedLinks.electron && detectedLinks.electron !== 'latest') {
      docLinks.push(`- [Electron v${detectedLinks.electron} Release Notes](https://releases.electronjs.org/release/v${detectedLinks.electron})`);
    }
    if (detectedLinks.configSections.size > 0) {
      docLinks.push(`- [Configuration Reference](${DOCS_BASE_URL}/configuration)`);
    }
    docLinks.push('');
    lines.push(...docLinks);
  }

  return lines.join('\n');
}

// CLI mode
if (process.argv[1]?.endsWith('generateReleaseNotes.mjs') || process.argv[1]?.endsWith('generateReleaseNotes.js')) {
  const args = process.argv.slice(2);
  const version = args.find(a => /^\d+\.\d+\.\d+$/.test(a)) || 'X.X.X';
  const releaseNotes = generateReleaseNotes();

  if (args.includes('--json')) {
    const jsonSafe = {
      ...releaseNotes,
      detectedLinks: releaseNotes.detectedLinks ? {
        electron: releaseNotes.detectedLinks.electron,
        configSections: Array.from(releaseNotes.detectedLinks.configSections || [])
      } : null
    };
    console.log(JSON.stringify(jsonSafe, null, 2));
  } else if (args.includes('--summary')) {
    console.log(formatSummary(releaseNotes, version));
  } else {
    console.log(formatMarkdown(releaseNotes, version));
  }
}

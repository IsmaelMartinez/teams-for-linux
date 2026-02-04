#!/usr/bin/env node

/**
 * Generate Enhanced Release Notes
 *
 * Reads changelog entries from .changelog/ directory and generates:
 * 1. Categorized changes (Features, Fixes, Documentation, etc.)
 * 2. Links to relevant documentation for new features
 * 3. Configuration hints for enable/disable options
 */

import fs from 'node:fs';
import path from 'node:path';

// Documentation base URL
const DOCS_BASE_URL = 'https://ismaelmartinez.github.io/teams-for-linux';

// Mapping of keywords to documentation pages
const FEATURE_DOCS = {
  mqtt: {
    doc: '/mqtt-integration',
    title: 'MQTT Integration',
    config: 'mqttHost, mqttPort, mqttTopic'
  },
  intune: {
    doc: '/intune-sso',
    title: 'Intune SSO',
    config: 'enableIntuneSso'
  },
  'screen sharing': {
    doc: '/screen-sharing',
    title: 'Screen Sharing',
    config: 'screenShareMode'
  },
  screensharing: {
    doc: '/screen-sharing',
    title: 'Screen Sharing',
    config: 'screenShareMode'
  },
  certificate: {
    doc: '/certificate',
    title: 'Certificate Configuration',
    config: 'customCACertsFingerprints'
  },
  notification: {
    doc: '/configuration#notification-system',
    title: 'Notification System',
    config: 'disableNotifications, notificationMethod'
  },
  tray: {
    doc: '/configuration#tray-icon',
    title: 'Tray Icon',
    config: 'trayIconEnabled, showBadgeCount'
  },
  background: {
    doc: '/custom-backgrounds',
    title: 'Custom Backgrounds',
    config: 'customBGServiceBaseUrl'
  },
  calendar: {
    doc: '/configuration#microsoft-graph-api',
    title: 'Microsoft Graph API',
    config: 'calendarExportEnabled, graphClientId'
  },
  theme: {
    doc: '/configuration#theming--appearance',
    title: 'Theming & Appearance',
    config: 'customCSSName, followSystemTheme'
  },
  idle: {
    doc: '/configuration#idle--activity-detection',
    title: 'Idle Detection',
    config: 'awayOnSystemIdle, appIdleTimeout'
  },
  proxy: {
    doc: '/configuration#network--proxy',
    title: 'Network & Proxy',
    config: 'proxyServer'
  },
  'multiple instance': {
    doc: '/multiple-instances',
    title: 'Multiple Instances',
    config: 'appTitle, partition'
  },
  troubleshoot: {
    doc: '/troubleshooting',
    title: 'Troubleshooting Guide',
    config: null
  }
};

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
  for (const [prefix, config] of Object.entries(CHANGE_TYPES)) {
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
 * Find relevant documentation links for an entry
 */
function findDocLinks(entry) {
  const links = [];
  const lowerEntry = entry.toLowerCase();

  for (const [keyword, info] of Object.entries(FEATURE_DOCS)) {
    if (lowerEntry.includes(keyword)) {
      links.push(info);
    }
  }

  return links;
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

  // Read and parse all entries
  const entries = files.map(file => {
    const content = fs.readFileSync(path.join(fullPath, file), 'utf8').trim();
    const parsed = parseEntry(content);
    parsed.docLinks = findDocLinks(content);
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

  // Collect all unique documentation links
  const allDocLinks = new Map();
  for (const entry of entries) {
    for (const link of entry.docLinks) {
      if (!allDocLinks.has(link.doc)) {
        allDocLinks.set(link.doc, link);
      }
    }
  }

  return {
    total: entries.length,
    categorized,
    docLinks: Array.from(allDocLinks.values()),
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

  // Add documentation links section if there are relevant docs
  if (releaseNotes.docLinks.length > 0) {
    lines.push('---\n');
    lines.push('### 📖 Related Documentation\n');
    lines.push('Learn more about features in this release:\n');

    for (const link of releaseNotes.docLinks) {
      const configNote = link.config ? ` (config: \`${link.config}\`)` : '';
      lines.push(`- [${link.title}](${DOCS_BASE_URL}${link.doc})${configNote}`);
    }
    lines.push('');
  }

  // Add quick reference footer
  lines.push('---\n');
  lines.push('**Configuration:** All options can be set via command-line or `config.json`.');
  lines.push(`See [Configuration Reference](${DOCS_BASE_URL}/configuration) for details.\n`);

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
  if (releaseNotes.docLinks.length > 0) {
    lines.push('### 📖 Related Documentation\n');
    for (const link of releaseNotes.docLinks) {
      lines.push(`- [${link.title}](${DOCS_BASE_URL}${link.doc})`);
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
    console.log(JSON.stringify(releaseNotes, null, 2));
  } else if (format === 'summary') {
    console.log(formatSummary(releaseNotes, version));
  } else {
    console.log(formatMarkdown(releaseNotes, version));
  }
}

#!/usr/bin/env node

/**
 * Generates troubleshooting-index.json from troubleshooting.md and configuration.md.
 *
 * Usage:
 *   node .github/issue-bot/scripts/generate-index.js
 *
 * Output:
 *   .github/issue-bot/troubleshooting-index.json
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TROUBLESHOOTING_PATH = path.join(REPO_ROOT, 'docs-site', 'docs', 'troubleshooting.md');
const CONFIGURATION_PATH = path.join(REPO_ROOT, 'docs-site', 'docs', 'configuration.md');
const OUTPUT_PATH = path.join(REPO_ROOT, '.github', 'issue-bot', 'troubleshooting-index.json');

const DOCS_BASE_URL = 'https://ismaelmartinez.github.io/teams-for-linux';

function toAnchorSlug(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

function extractGitHubIssues(text) {
	const matches = text.match(/#(\d+)/g);
	return matches ? [...new Set(matches)] : [];
}

function stripDocusaurusAdmonitions(text) {
	return text.replace(/^:::\w+.*$\n?/gm, '').replace(/^:::$/gm, '');
}

function parseTroubleshooting(content) {
	const sections = [];
	const cleaned = stripDocusaurusAdmonitions(content);
	const lines = cleaned.split('\n');

	let currentCategory = '';
	let currentSection = null;
	let buffer = [];

	function flushSection() {
		if (!currentSection) return;

		const body = buffer.join('\n');
		const descMatch = body.match(/\*\*Description:\*\*\s*([\s\S]*?)(?=\n\*\*(?:Potential Causes|Solutions|Related|Status)|\n####|\n---)/);
		const solMatch = body.match(/\*\*Solutions\/Workarounds:\*\*\s*([\s\S]*?)(?=\n\*\*(?:Related|Status)|\n####|\n---|$)/);
		const relMatch = body.match(/\*\*Related GitHub Issues:\*\*\s*(.*)/);

		const description = descMatch ? descMatch[1].trim() : '';
		const solutions = solMatch
			? solMatch[1]
				.replace(/```[\s\S]*?```/g, '')
				.replace(/^\s*\d+\.\s*/gm, '')
				.replace(/\*\s+/g, '')
				.replace(/\n{2,}/g, ' ')
				.trim()
			: '';
		const relatedIssues = relMatch ? extractGitHubIssues(relMatch[1]) : [];

		if (description || solutions) {
			const anchor = toAnchorSlug(`issue ${currentSection}`);
			sections.push({
				title: currentSection,
				category: currentCategory,
				description,
				solutions,
				anchor,
				docUrl: `${DOCS_BASE_URL}/troubleshooting#${anchor}`,
				relatedIssues,
				source: 'troubleshooting',
			});
		}

		currentSection = null;
		buffer = [];
	}

	for (const line of lines) {
		const catMatch = line.match(/^### (.+)/);
		if (catMatch && !line.startsWith('####')) {
			flushSection();
			currentCategory = catMatch[1].trim();
			continue;
		}

		const secMatch = line.match(/^#### Issue:\s*(.+)/);
		if (secMatch) {
			flushSection();
			currentSection = secMatch[1].trim();
			continue;
		}

		if (currentSection) {
			buffer.push(line);
		}
	}

	flushSection();
	return sections;
}

function parseConfiguration(content) {
	const sections = [];
	const cleaned = stripDocusaurusAdmonitions(content);

	// Extract notable configuration guides from the "Usage Examples & Guides" section
	// that contain troubleshooting-relevant information
	const guides = [
		{
			title: 'Cache Management configuration',
			searchPattern: /### Cache Management\s*\n([\s\S]*?)(?=\n### |\n## |$)/,
			category: 'Cache & Storage',
		},
		{
			title: 'Custom Notifications configuration',
			searchPattern: /#### Custom Notifications Setup\s*\n([\s\S]*?)(?=\n####|\n### |$)/,
			category: 'Notification System',
		},
		{
			title: 'Electron CLI Flags and Wayland GPU handling',
			searchPattern: /### Electron CLI Flags\s*\n([\s\S]*?)(?=\n### |$)/,
			category: 'Performance & Hardware',
		},
		{
			title: 'Tray Icon Behavior by Desktop Environment',
			searchPattern: /### Tray Icon Behavior by Desktop Environment\s*\n([\s\S]*?)(?=\n### |$)/,
			category: 'Tray Icon',
		},
	];

	for (const guide of guides) {
		const match = cleaned.match(guide.searchPattern);
		if (!match) continue;

		const body = match[1]
			.replace(/```[\s\S]*?```/g, '')
			.replace(/\|[^\n]+\|/g, '')
			.replace(/>\s*\[!NOTE\]\s*/g, '')
			.replace(/>\s*\[!WARNING\]\s*/g, '')
			.replace(/>\s*/g, '')
			.replace(/\n{2,}/g, ' ')
			.trim();

		const anchor = toAnchorSlug(guide.title.replace(' configuration', ''));
		const relatedIssues = extractGitHubIssues(match[1]);

		sections.push({
			title: guide.title,
			category: guide.category,
			description: body.substring(0, 300),
			solutions: body,
			anchor,
			docUrl: `${DOCS_BASE_URL}/configuration#${anchor}`,
			relatedIssues,
			source: 'configuration',
		});
	}

	return sections;
}

function main() {
	const troubleshootingContent = fs.readFileSync(TROUBLESHOOTING_PATH, 'utf-8');
	const configContent = fs.readFileSync(CONFIGURATION_PATH, 'utf-8');

	const troubleshootingSections = parseTroubleshooting(troubleshootingContent);
	const configSections = parseConfiguration(configContent);

	const index = [...troubleshootingSections, ...configSections];

	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2) + '\n');

	console.log(`Generated ${OUTPUT_PATH}`);
	console.log(`  Troubleshooting sections: ${troubleshootingSections.length}`);
	console.log(`  Configuration sections: ${configSections.length}`);
	console.log(`  Total: ${index.length}`);
}

main();

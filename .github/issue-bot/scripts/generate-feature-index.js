#!/usr/bin/env node

/**
 * Generates feature-index.json from the development roadmap, ADRs, and research docs.
 *
 * Parses local markdown files to build a compact index of features, decisions,
 * and research topics for the enhancement triage bot (Phase 4).
 *
 * Usage:
 *   node .github/issue-bot/scripts/generate-feature-index.js
 *
 * Output:
 *   .github/issue-bot/feature-index.json
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs-site', 'docs');
const ROADMAP_PATH = path.join(DOCS_ROOT, 'development', 'plan', 'roadmap.md');
const ADR_DIR = path.join(DOCS_ROOT, 'development', 'adr');
const RESEARCH_DIR = path.join(DOCS_ROOT, 'development', 'research');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'feature-index.json');

const DOCS_BASE_URL = 'https://ismaelmartinez.github.io/teams-for-linux';
const MAX_ENTRIES = 100;
const SUMMARY_MAX_LENGTH = 200;

/**
 * Strip markdown link and bold syntax from a string.
 */
function stripBasicMarkdown(str) {
	return (str || '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.trim();
}

/**
 * Get the last commit date for a file via git log.
 * Falls back to file mtime if git is unavailable.
 */
function getLastUpdated(filePath) {
	try {
		const result = execFileSync(
			'git', ['log', '-1', '--format=%aI', '--', filePath],
			{ cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
		).trim();
		if (result) return result.substring(0, 10);
	} catch (e) {
		console.log(`git log failed for ${path.basename(filePath)}: ${e.message}`);
	}

	try {
		const stat = fs.statSync(filePath);
		return stat.mtime.toISOString().substring(0, 10);
	} catch (e) {
		console.log(`stat failed for ${path.basename(filePath)}: ${e.message}`);
		return null;
	}
}

/**
 * Normalise a status string into one of the canonical values.
 */
function normaliseStatus(raw) {
	if (!raw) return 'investigating';
	const lower = raw.toLowerCase().trim();

	if (/\bship(ped)?\b/.test(lower) || /\bimplement(ed)?\b/.test(lower) || /\bdone\b/.test(lower) || /\bcomplete\b/.test(lower) || /\baccepted\b/.test(lower)) {
		return 'shipped';
	}
	if (/\breject(ed)?\b/.test(lower) || /\bnot (feasible|planned|recommended)\b/.test(lower) || /\barchived\b/.test(lower) || /\bdropped\b/.test(lower)) {
		return 'rejected';
	}
	if (/\bdefer(red)?\b/.test(lower) || /\bstalled\b/.test(lower) || /\bblocked\b/.test(lower) || /\bawaiting\b/.test(lower)) {
		return 'deferred';
	}
	if (/\bplanned\b/.test(lower) || /\bready\b/.test(lower) || /\bproposed\b/.test(lower) || /\bopen\b/.test(lower) || /\bactive\b/.test(lower)) {
		return 'planned';
	}
	return 'investigating';
}

/**
 * Strip Docusaurus admonitions and YAML frontmatter from markdown.
 */
function stripMarkdownChrome(content) {
	return content
		.replace(/^---[\s\S]*?^---\s*/m, '')
		.replace(/^:::\w+.*$\n?/gm, '')
		.replace(/^:::$/gm, '');
}

/**
 * Extract a one-line summary from markdown content.
 * Takes the first substantive paragraph (not a heading, not blank).
 */
function extractSummary(content, maxLen = SUMMARY_MAX_LENGTH) {
	const cleaned = stripMarkdownChrome(content);
	const lines = cleaned.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith('#')) continue;
		if (trimmed.startsWith('|')) continue;
		if (trimmed.startsWith('>')) {
			const inner = trimmed.replace(/^>\s*/, '').trim();
			if (inner && !inner.startsWith('**Issue') && !inner.startsWith('[!')) {
				return inner.substring(0, maxLen);
			}
			continue;
		}
		if (trimmed.startsWith('**Status') || trimmed.startsWith('**Date') || trimmed.startsWith('**Author') || trimmed.startsWith('**Scope')) continue;
		// Remove markdown formatting for the summary
		const plain = stripBasicMarkdown(trimmed)
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/`[^`]+`/g, '')
			.trim();
		if (plain) return plain.substring(0, maxLen);
	}
	return '';
}

/**
 * Parse the roadmap for features in the Quick Reference table and
 * the Not Planned / Not Feasible table.
 */
function parseRoadmap(content) {
	const entries = [];
	const cleaned = stripMarkdownChrome(content);

	// Parse Quick Reference table rows
	const quickRefMatch = cleaned.match(/## Quick Reference\s*\n([\s\S]*?)(?=\n---|\n## )/);
	if (quickRefMatch) {
		const tableLines = quickRefMatch[1].split('\n').filter((l) => l.trim().startsWith('|'));
		// Skip header and separator
		for (let i = 2; i < tableLines.length; i++) {
			const cells = tableLines[i].split('|').map((c) => c.trim()).filter(Boolean);
			if (cells.length < 4) continue;
			const [statusRaw, featureRaw, descRaw] = cells;
			const feature = stripBasicMarkdown(featureRaw);
			// Use the status column (Priority) as primary signal; only fall back
			// to the description if the status column is ambiguous.
			const statusFromColumn = normaliseStatus(statusRaw);
			const status = statusFromColumn !== 'investigating'
				? statusFromColumn
				: normaliseStatus(descRaw);
			const summary = stripBasicMarkdown(descRaw)
				.substring(0, SUMMARY_MAX_LENGTH);
			if (feature) {
				entries.push({
					topic: feature,
					status,
					doc_path: 'docs-site/docs/development/plan/roadmap.md',
					doc_url: `${DOCS_BASE_URL}/development/plan/roadmap`,
					summary,
					source: 'roadmap',
				});
			}
		}
	}

	// Parse Not Planned / Not Feasible table
	const notPlannedMatch = cleaned.match(/## Not Planned \/ Not Feasible\s*\n([\s\S]*?)(?=\n---|\n## )/);
	if (notPlannedMatch) {
		const tableLines = notPlannedMatch[1].split('\n').filter((l) => l.trim().startsWith('|'));
		for (let i = 2; i < tableLines.length; i++) {
			const cells = tableLines[i].split('|').map((c) => c.trim()).filter(Boolean);
			if (cells.length < 3) continue;
			const [featureRaw, , reasonRaw] = cells;
			const feature = stripBasicMarkdown(featureRaw);
			const reason = stripBasicMarkdown(reasonRaw)
				.substring(0, SUMMARY_MAX_LENGTH);
			if (feature) {
				entries.push({
					topic: feature,
					status: 'rejected',
					doc_path: 'docs-site/docs/development/plan/roadmap.md',
					doc_url: `${DOCS_BASE_URL}/development/plan/roadmap#not-planned--not-feasible`,
					summary: reason || `${feature} — not planned`,
					source: 'roadmap',
				});
			}
		}
	}

	return entries;
}

/**
 * Parse ADR files for decisions.
 */
function parseADRs() {
	const entries = [];

	const files = fs.readdirSync(ADR_DIR)
		.filter((f) => f.match(/^\d{3}-.*\.md$/))
		.sort();

	for (const file of files) {
		const filePath = path.join(ADR_DIR, file);
		const content = fs.readFileSync(filePath, 'utf-8');
		const cleaned = stripMarkdownChrome(content);

		// Extract title from first H1
		const titleMatch = cleaned.match(/^# (.+)/m);
		const title = titleMatch ? titleMatch[1].trim() : file.replace('.md', '');

		// Extract status from ## Status section
		const statusMatch = cleaned.match(/## Status\s*\n\s*(.+)/);
		const statusRaw = statusMatch ? statusMatch[1].replace(/[❌✅⚠️🔄]/g, '').trim() : '';
		const status = normaliseStatus(statusRaw);

		// Extract summary — first line of ## Context or ## Decision
		const contextMatch = cleaned.match(/## Context\s*\n([\s\S]*?)(?=\n## )/);
		const summary = contextMatch
			? extractSummary(contextMatch[1])
			: extractSummary(cleaned);

		const slug = file.replace('.md', '');
		const lastUpdated = getLastUpdated(filePath);

		entries.push({
			topic: title,
			status,
			doc_path: `docs-site/docs/development/adr/${file}`,
			doc_url: `${DOCS_BASE_URL}/development/adr/${slug}`,
			summary: summary.substring(0, SUMMARY_MAX_LENGTH),
			last_updated: lastUpdated,
			source: 'adr',
		});
	}

	return entries;
}

/**
 * Parse research documents for topic entries.
 */
function parseResearchDocs() {
	const entries = [];

	const files = fs.readdirSync(RESEARCH_DIR)
		.filter((f) => f.endsWith('.md') && f !== 'README.md')
		.sort();

	for (const file of files) {
		const filePath = path.join(RESEARCH_DIR, file);
		const content = fs.readFileSync(filePath, 'utf-8');
		const cleaned = stripMarkdownChrome(content);

		// Extract title from first H1
		const titleMatch = cleaned.match(/^# (.+)/m);
		const title = titleMatch ? titleMatch[1].trim() : file.replace('.md', '');

		// Extract status from **Status:** line or admonition
		let statusRaw = '';
		const statusLineMatch = content.match(/\*\*Status:\*\*\s*(.+)/);
		if (statusLineMatch) {
			statusRaw = statusLineMatch[1].trim();
		} else {
			// Try admonition header
			const admonitionMatch = content.match(/^:::\w+\s+(.+)/m);
			if (admonitionMatch) {
				statusRaw = admonitionMatch[1].trim();
			}
		}
		const status = normaliseStatus(statusRaw);

		// Extract summary from ## Executive Summary, ## Summary, or first paragraph
		let summary = '';
		const execSummaryMatch = cleaned.match(/## (?:Executive )?Summary\s*\n([\s\S]*?)(?=\n## )/);
		if (execSummaryMatch) {
			summary = extractSummary(execSummaryMatch[1]);
		} else {
			summary = extractSummary(cleaned);
		}

		const slug = file.replace('.md', '');
		const lastUpdated = getLastUpdated(filePath);

		entries.push({
			topic: title,
			status,
			doc_path: `docs-site/docs/development/research/${file}`,
			doc_url: `${DOCS_BASE_URL}/development/research/${slug}`,
			summary: summary.substring(0, SUMMARY_MAX_LENGTH),
			last_updated: lastUpdated,
			source: 'research',
		});
	}

	return entries;
}

function main() {
	const roadmapContent = fs.readFileSync(ROADMAP_PATH, 'utf-8');

	const roadmapEntries = parseRoadmap(roadmapContent);
	const adrEntries = parseADRs();
	const researchEntries = parseResearchDocs();

	// Combine all entries, capped at MAX_ENTRIES
	const combined = [...roadmapEntries, ...adrEntries, ...researchEntries].slice(0, MAX_ENTRIES);

	// Add last_updated to roadmap entries that don't have it
	const roadmapLastUpdated = getLastUpdated(ROADMAP_PATH);
	for (const entry of combined) {
		if (!entry.last_updated && entry.source === 'roadmap') {
			entry.last_updated = roadmapLastUpdated;
		}
	}

	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(combined, null, 2) + '\n');

	console.log(`Generated ${OUTPUT_PATH}`);
	console.log(`  Roadmap entries: ${roadmapEntries.length}`);
	console.log(`  ADR entries: ${adrEntries.length}`);
	console.log(`  Research entries: ${researchEntries.length}`);
	console.log(`  Total: ${combined.length} (cap: ${MAX_ENTRIES})`);
}

main();

#!/usr/bin/env node

/**
 * Generates issue-index.json from the GitHub Issues API.
 *
 * Fetches open issues and recently closed issues (last 90 days),
 * produces compact summaries for duplicate detection via Gemini Flash.
 *
 * Usage:
 *   GITHUB_TOKEN=<YOUR_GITHUB_TOKEN> node .github/issue-bot/scripts/generate-issue-index.js
 *
 * Environment variables:
 *   GITHUB_TOKEN      — Required. GitHub token with issues:read scope.
 *   GITHUB_REPOSITORY — Optional. Defaults to "IsmaelMartinez/teams-for-linux".
 *
 * Output:
 *   .github/issue-bot/issue-index.json
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.resolve(__dirname, '..', 'issue-index.json');
const MAX_ENTRIES = 200;
const CLOSED_LOOKBACK_DAYS = 90;
const SUMMARY_MAX_LENGTH = 200;

function getConfig() {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		console.error('GITHUB_TOKEN environment variable is required');
		process.exit(1);
	}

	const repo = process.env.GITHUB_REPOSITORY || 'IsmaelMartinez/teams-for-linux';
	const [owner, name] = repo.split('/');
	return { token, owner, repoName: name };
}

async function fetchWithRetry(url, headers, retries = 3) {
	for (let attempt = 1; attempt <= retries; attempt++) {
		const response = await fetch(url, { headers });

		if (response.ok) {
			return response;
		}

		// Handle rate limiting (403 or 429) by waiting for reset
		if ((response.status === 403 || response.status === 429) && attempt < retries) {
			const resetHeader = response.headers.get('x-ratelimit-reset');
			const retryAfter = response.headers.get('retry-after');
			let waitMs = 60_000; // Default: wait 60 seconds

			if (resetHeader) {
				waitMs = Math.max(0, (Number(resetHeader) * 1000) - Date.now()) + 1000;
			} else if (retryAfter) {
				waitMs = Number(retryAfter) * 1000;
			}

			// Cap wait at 5 minutes
			waitMs = Math.min(waitMs, 300_000);
			console.log(`Rate limited (${response.status}), waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${retries}...`);
			await new Promise((resolve) => setTimeout(resolve, waitMs));
			continue;
		}

		throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
	}
}

async function fetchAllPages(url, token) {
	const results = [];
	let nextUrl = url;
	const headers = {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};

	while (nextUrl) {
		const response = await fetchWithRetry(nextUrl, headers);

		const data = await response.json();
		results.push(...data);

		// Parse Link header for pagination
		const linkHeader = response.headers.get('link') || '';
		const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
		nextUrl = nextMatch ? nextMatch[1] : null;
	}

	return results;
}

function sanitizeBody(body) {
	if (!body) return '';

	return body
		// Remove code fences and their contents
		.replace(/```[\s\S]*?```/g, '')
		// Remove inline code
		.replace(/`[^`]+`/g, '')
		// Remove images
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		// Remove HTML tags (including incomplete/unclosed tags)
		.replace(/<[^>]*>/g, '')
		.replace(/<[^>]*$/gm, '')
		// Remove markdown links but keep text
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		// Remove markdown headers
		.replace(/^#{1,6}\s+/gm, '')
		// Remove issue template default values
		.replace(/_No response_/g, '')
		// Collapse whitespace
		.replace(/\n{2,}/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.substring(0, SUMMARY_MAX_LENGTH);
}

function formatDate(dateString) {
	if (!dateString) return null;
	return dateString.substring(0, 10); // "2026-02-17T..." → "2026-02-17"
}

function toEntry(issue) {
	return {
		number: issue.number,
		title: issue.title,
		state: issue.state,
		labels: (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
		summary: sanitizeBody(issue.body),
		created_at: formatDate(issue.created_at),
		closed_at: formatDate(issue.closed_at),
		milestone: issue.milestone ? issue.milestone.title : null,
	};
}

function isBot(issue) {
	const login = issue.user?.login || '';
	const type = issue.user?.type || '';
	return type === 'Bot' || login.includes('[bot]') || login.endsWith('-bot');
}

function isPullRequest(issue) {
	return !!issue.pull_request;
}

async function main() {
	const { token, owner, repoName } = getConfig();
	const baseUrl = `https://api.github.com/repos/${owner}/${repoName}/issues`;

	// Fetch open issues
	console.log('Fetching open issues...');
	const openIssues = await fetchAllPages(
		`${baseUrl}?state=open&per_page=100&sort=created&direction=desc`,
		token
	);

	// Fetch closed issues from the last N days
	const sinceDate = new Date();
	sinceDate.setDate(sinceDate.getDate() - CLOSED_LOOKBACK_DAYS);
	const sinceISO = sinceDate.toISOString();

	console.log(`Fetching closed issues since ${sinceISO.substring(0, 10)}...`);
	const closedIssues = await fetchAllPages(
		`${baseUrl}?state=closed&since=${sinceISO}&per_page=100&sort=updated&direction=desc`,
		token
	);

	// Filter out PRs and bot-created issues
	const filteredOpen = openIssues
		.filter((i) => !isPullRequest(i) && !isBot(i))
		.map(toEntry);

	const filteredClosed = closedIssues
		.filter((i) => !isPullRequest(i) && !isBot(i))
		.map(toEntry);

	// Combine: open first, then closed (most recently closed first)
	// Cap at MAX_ENTRIES total
	const combined = [...filteredOpen, ...filteredClosed].slice(0, MAX_ENTRIES);

	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(combined, null, 2) + '\n');

	console.log(`Generated ${OUTPUT_PATH}`);
	console.log(`  Open issues: ${filteredOpen.length}`);
	console.log(`  Closed issues (last ${CLOSED_LOOKBACK_DAYS} days): ${filteredClosed.length}`);
	console.log(`  Total entries: ${combined.length} (cap: ${MAX_ENTRIES})`);
}

main().catch((error) => {
	console.error('Failed to generate issue index:', error.message);
	process.exit(1);
});

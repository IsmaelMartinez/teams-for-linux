#!/usr/bin/env node

/**
 * Tallies GitHub reactions on issue triage bot comments to measure accuracy.
 *
 * Scans issues that received a bot comment in the configured lookback window,
 * counts thumbs-up (+1) and thumbs-down (-1) reactions on the bot's comment,
 * and tracks whether the issue was closed within 48 hours of the bot comment
 * (a rough proxy for "the suggestion helped").
 *
 * Usage:
 *   GITHUB_TOKEN=<token> node .github/issue-bot/scripts/tally-bot-feedback.js
 *
 * Environment variables:
 *   GITHUB_TOKEN      — Required. GitHub token with issues:read scope.
 *   GITHUB_REPOSITORY — Optional. Defaults to "IsmaelMartinez/teams-for-linux".
 *   LOOKBACK_DAYS     — Optional. How far back to scan. Defaults to 30.
 *
 * Output:
 *   .github/issue-bot/accuracy-report.json
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.resolve(__dirname, '..', 'accuracy-report.json');
const BOT_SIGNATURE = "I'm a bot that helps with issue triage";
const QUICK_RESOLUTION_HOURS = 48;

function getConfig() {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		console.error('GITHUB_TOKEN environment variable is required');
		process.exit(1);
	}

	const repo = process.env.GITHUB_REPOSITORY || 'IsmaelMartinez/teams-for-linux';
	const [owner, name] = repo.split('/');
	const lookbackDays = parseInt(process.env.LOOKBACK_DAYS || '30', 10);
	return { token, owner, repoName: name, lookbackDays };
}

async function fetchWithRetry(url, headers, retries = 3) {
	for (let attempt = 1; attempt <= retries; attempt++) {
		const response = await fetch(url, { headers });

		if (response.ok) {
			return response;
		}

		if ((response.status === 403 || response.status === 429) && attempt < retries) {
			const resetHeader = response.headers.get('x-ratelimit-reset');
			const retryAfter = response.headers.get('retry-after');
			let waitMs = 60_000;

			if (resetHeader) {
				waitMs = Math.max(0, (Number(resetHeader) * 1000) - Date.now()) + 1000;
			} else if (retryAfter) {
				waitMs = Number(retryAfter) * 1000;
			}

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
		results.push(...(Array.isArray(data) ? data : data.items || []));

		const linkHeader = response.headers.get('link') || '';
		const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
		nextUrl = nextMatch ? nextMatch[1] : null;
	}

	return results;
}

async function fetchReactions(owner, repoName, commentId, token) {
	const headers = {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};

	const url = `https://api.github.com/repos/${owner}/${repoName}/issues/comments/${commentId}/reactions`;
	const response = await fetchWithRetry(url, headers);
	return response.json();
}

async function main() {
	const { token, owner, repoName, lookbackDays } = getConfig();

	const sinceDate = new Date();
	sinceDate.setDate(sinceDate.getDate() - lookbackDays);
	const sinceISO = sinceDate.toISOString();

	console.log(`Scanning bot comments from the last ${lookbackDays} days...`);

	// Use search API to find issues with bot comments directly
	const baseUrl = `https://api.github.com/repos/${owner}/${repoName}/issues`;
	const searchParams = new URLSearchParams({
		q: `repo:${owner}/${repoName} is:issue "${BOT_SIGNATURE}" in:comments updated:>=${sinceISO}`,
		per_page: '100',
		sort: 'updated',
		direction: 'desc',
	});
	const searchUrl = `https://api.github.com/search/issues?${searchParams.toString()}`;

	const issues = await fetchAllPages(searchUrl, token);

	console.log(`Found ${issues.length} issues to scan for bot comments`);

	const entries = [];
	let thumbsUp = 0;
	let thumbsDown = 0;
	let noReaction = 0;
	let quickResolutions = 0;
	let totalWithBotComment = 0;

	for (const issue of issues) {
		// Fetch comments for this issue
		const comments = await fetchAllPages(
			`${baseUrl}/${issue.number}/comments?per_page=100`,
			token
		);

		// Find the bot triage comment
		const botComment = comments.find(
			(c) => c.user.type === 'Bot' && c.body && c.body.includes(BOT_SIGNATURE)
		);

		if (!botComment) continue;

		totalWithBotComment++;

		// Fetch reactions on the bot comment
		const reactions = await fetchReactions(owner, repoName, botComment.id, token);

		const { up, down } = reactions.reduce((counts, r) => {
			if (r.content === '+1') counts.up++;
			else if (r.content === '-1') counts.down++;
			return counts;
		}, { up: 0, down: 0 });

		thumbsUp += up;
		thumbsDown += down;
		if (up === 0 && down === 0) noReaction++;

		// Check for quick resolution (closed within 48h of bot comment)
		let quicklyResolved = false;
		if (issue.state === 'closed' && issue.closed_at) {
			const botCommentTime = new Date(botComment.created_at);
			const closedTime = new Date(issue.closed_at);
			const hoursToClose = (closedTime - botCommentTime) / (1000 * 60 * 60);
			if (hoursToClose >= 0 && hoursToClose <= QUICK_RESOLUTION_HOURS) {
				quicklyResolved = true;
				quickResolutions++;
			}
		}

		entries.push({
			issue: issue.number,
			title: issue.title,
			state: issue.state,
			thumbs_up: up,
			thumbs_down: down,
			quickly_resolved: quicklyResolved,
			bot_comment_date: botComment.created_at.substring(0, 10),
		});
	}

	const total = thumbsUp + thumbsDown;
	const accuracyPct = total > 0 ? Math.round((thumbsUp / total) * 100) : null;

	const report = {
		generated_at: new Date().toISOString(),
		lookback_days: lookbackDays,
		summary: {
			issues_with_bot_comment: totalWithBotComment,
			thumbs_up: thumbsUp,
			thumbs_down: thumbsDown,
			no_reaction: noReaction,
			accuracy_percentage: accuracyPct,
			quick_resolutions: quickResolutions,
			quick_resolution_window_hours: QUICK_RESOLUTION_HOURS,
		},
		entries,
	};

	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + '\n');

	console.log('\n=== Bot Accuracy Report ===');
	console.log(`Issues with bot comment: ${totalWithBotComment}`);
	console.log(`Thumbs up: ${thumbsUp}`);
	console.log(`Thumbs down: ${thumbsDown}`);
	console.log(`No reaction: ${noReaction}`);
	console.log(`Accuracy: ${accuracyPct !== null ? `${accuracyPct}%` : 'N/A (no reactions yet)'}`);
	console.log(`Quick resolutions (≤${QUICK_RESOLUTION_HOURS}h): ${quickResolutions}`);
	console.log(`\nReport written to ${OUTPUT_PATH}`);
}

main().catch((error) => {
	console.error('Failed to generate accuracy report:', error.message);
	process.exit(1);
});

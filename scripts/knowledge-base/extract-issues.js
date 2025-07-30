#!/usr/bin/env node

/**
 * GitHub Issues Extraction using Standard REST API
 *
 * This script extracts all issues from the teams-for-linux repository
 * using the standard GitHub REST API. It's designed to be simple,
 * maintainable, and accessible to all contributors.
 *
 * Features:
 * - Standard GitHub REST API (no external dependencies)
 * - Rate limiting and pagination handling
 * - Personal access token support for higher limits
 * - Comprehensive error handling
 * - Progress tracking and validation
 */

const https = require("https");
const fs = require("fs").promises;
const path = require("path");

// Configuration
const CONFIG = {
  // Repository details
  REPO_OWNER: "IsmaelMartinez",
  REPO_NAME: "teams-for-linux",

  // Output configuration
  DATA_DIR: path.join(__dirname, "../../data/issues"),
  RAW_ISSUES_FILE: "raw-issues.json",
  METADATA_FILE: "extraction-metadata.json",

  // API configuration
  BASE_URL: "https://api.github.com",
  PER_PAGE: 100, // Maximum allowed by GitHub API
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second base delay

  // Authentication (optional - improves rate limits)
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || null,
};

class GitHubIssuesExtractor {
  constructor() {
    this.extractedIssues = [];
    this.totalProcessed = 0;
    this.startTime = Date.now();
    this.rateLimit = {
      remaining: null,
      resetTime: null,
      limit: null,
    };
  }

  /**
   * Make authenticated HTTPS request to GitHub API
   */
  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${CONFIG.BASE_URL}${endpoint}`);

    // Add query parameters
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const options = {
      method: "GET",
      headers: {
        "User-Agent": "teams-for-linux-knowledge-base/1.0",
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };

    // Add authentication if token is available
    if (CONFIG.GITHUB_TOKEN) {
      options.headers["Authorization"] = `Bearer ${CONFIG.GITHUB_TOKEN}`;
    }

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          // Update rate limit information
          this.rateLimit = {
            remaining: parseInt(res.headers["x-ratelimit-remaining"]) || 0,
            resetTime: parseInt(res.headers["x-ratelimit-reset"]) * 1000 || 0,
            limit: parseInt(res.headers["x-ratelimit-limit"]) || 0,
          };

          try {
            const parsed = JSON.parse(data);

            // Handle various error conditions
            if (
              res.statusCode === 403 &&
              parsed.message?.includes("rate limit")
            ) {
              const resetDate = new Date(this.rateLimit.resetTime);
              reject(
                new Error(
                  `Rate limit exceeded. Resets at ${resetDate.toISOString()}`
                )
              );
              return;
            }

            if (res.statusCode === 401) {
              reject(
                new Error("Authentication failed. Check your GitHub token.")
              );
              return;
            }

            if (res.statusCode >= 400) {
              reject(
                new Error(
                  `GitHub API error: ${res.statusCode} - ${
                    parsed.message || "Unknown error"
                  }`
                )
              );
              return;
            }

            resolve({
              data: parsed,
              statusCode: res.statusCode,
              rateLimit: this.rateLimit,
            });
          } catch (error) {
            reject(
              new Error(`Failed to parse JSON response: ${error.message}`)
            );
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timeout after 30 seconds"));
      });

      req.end();
    });
  }

  /**
   * Extract all issues with pagination
   */
  async extractAllIssues() {
    console.log("🚀 Starting GitHub issues extraction...");
    console.log(`📦 Repository: ${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}`);
    console.log(
      `🔑 Authentication: ${
        CONFIG.GITHUB_TOKEN ? "Token provided" : "No token (lower rate limits)"
      }`
    );
    console.log("");

    let page = 1;
    const allIssues = [];

    while (true) {
      try {
        console.log(`� Fetching page ${page}...`);

        const response = await this.makeRequest(
          `/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues`,
          {
            state: "all",
            sort: "created",
            direction: "desc",
            per_page: CONFIG.PER_PAGE,
            page: page,
          }
        );

        const issues = response.data;

        if (!Array.isArray(issues) || issues.length === 0) {
          console.log("✅ No more issues found - extraction complete");
          break;
        }

        // Process and validate issues
        const processedIssues = issues.map((issue) => this.processIssue(issue));
        allIssues.push(...processedIssues);
        this.totalProcessed += issues.length;

        console.log(
          `   ✓ Extracted ${issues.length} issues (Total: ${allIssues.length})`
        );
        console.log(
          `   ⏱️  Rate limit: ${this.rateLimit.remaining}/${this.rateLimit.limit} remaining`
        );

        // Check if we have all issues (last page)
        if (issues.length < CONFIG.PER_PAGE) {
          console.log("✅ Reached last page - extraction complete");
          break;
        }

        page++;

        // Rate limiting protection
        await this.handleRateLimit();
      } catch (error) {
        console.error(`❌ Error on page ${page}:`, error.message);

        // Handle rate limiting with exponential backoff
        if (error.message.includes("rate limit")) {
          const waitTime = Math.max(
            this.rateLimit.resetTime - Date.now(),
            60000
          );
          console.log(
            `⏳ Rate limit hit, waiting ${Math.ceil(
              waitTime / 1000
            )} seconds...`
          );
          await this.sleep(waitTime);
          continue; // Retry the same page
        }

        // Retry logic for other errors
        let retryCount = 0;
        while (retryCount < CONFIG.MAX_RETRIES) {
          retryCount++;
          const delay = CONFIG.RETRY_DELAY * Math.pow(2, retryCount - 1);
          console.log(
            `🔄 Retrying in ${delay}ms (attempt ${retryCount}/${CONFIG.MAX_RETRIES})...`
          );
          await this.sleep(delay);

          // If we've exhausted retries, throw the original error
          if (retryCount === CONFIG.MAX_RETRIES) {
            throw new Error(
              `Failed after ${CONFIG.MAX_RETRIES} retries: ${error.message}`
            );
          }

          // Break out to retry the main request
          break;
        }
      }
    }

    this.extractedIssues = allIssues;
    return allIssues;
  }

  /**
   * Process and validate individual issue data
   */
  processIssue(issue) {
    return {
      // Core issue data
      id: issue.id,
      number: issue.number,
      title: issue.title || "No title",
      body: issue.body || "",
      state: issue.state,
      state_reason: issue.state_reason || null,

      // User information
      user: {
        login: issue.user?.login || "unknown",
        id: issue.user?.id || null,
        type: issue.user?.type || "User",
      },

      // Labels
      labels: (issue.labels || []).map((label) => ({
        name: label.name,
        description: label.description || "",
        color: label.color || "",
      })),

      // Assignees
      assignees: (issue.assignees || []).map((assignee) => ({
        login: assignee.login,
        id: assignee.id,
      })),

      // Timestamps
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at || null,

      // Additional metadata
      comments: issue.comments || 0,
      html_url: issue.html_url,
      is_pull_request: !!issue.pull_request,
      reactions: {
        total_count: issue.reactions?.total_count || 0,
        plus_one: issue.reactions?.["+1"] || 0,
        minus_one: issue.reactions?.["-1"] || 0,
        laugh: issue.reactions?.laugh || 0,
        hooray: issue.reactions?.hooray || 0,
        confused: issue.reactions?.confused || 0,
        heart: issue.reactions?.heart || 0,
        rocket: issue.reactions?.rocket || 0,
        eyes: issue.reactions?.eyes || 0,
      },

      // Processing metadata
      extracted_at: new Date().toISOString(),
      extractor_version: "2.0.0",
    };
  }

  /**
   * Handle rate limiting with smart delays
   */
  async handleRateLimit() {
    if (this.rateLimit.remaining <= 5) {
      const waitTime = Math.max(this.rateLimit.resetTime - Date.now(), 1000);
      console.log(
        `⏳ Rate limit low (${
          this.rateLimit.remaining
        } remaining), waiting ${Math.ceil(waitTime / 1000)} seconds...`
      );
      await this.sleep(waitTime + 1000); // Add 1 second buffer
    } else {
      // Small delay between requests to be nice to the API
      await this.sleep(100);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Save extracted data to files
   */
  async saveData() {
    console.log("\n� Saving extracted data...");

    // Ensure data directory exists
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });

    // Prepare data for saving
    const extractionData = {
      metadata: {
        version: "2.0.0",
        repository: `${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}`,
        extracted_at: new Date().toISOString(),
        extraction_method: "github-rest-api",
        extractor_version: "2.0.0",
      },
      validation: {
        total_issues: this.extractedIssues.length,
        unique_issues: new Set(this.extractedIssues.map((i) => i.id)).size,
        issues_with_comments: this.extractedIssues.filter((i) => i.comments > 0)
          .length,
        closed_issues: this.extractedIssues.filter((i) => i.state === "closed")
          .length,
        open_issues: this.extractedIssues.filter((i) => i.state === "open")
          .length,
        pull_requests: this.extractedIssues.filter((i) => i.is_pull_request)
          .length,
        validation_time: new Date().toISOString(),
      },
      issues: this.extractedIssues,
    };

    // Save raw issues data
    const issuesFile = path.join(CONFIG.DATA_DIR, CONFIG.RAW_ISSUES_FILE);
    await fs.writeFile(issuesFile, JSON.stringify(extractionData, null, 2));

    // Save metadata
    const metadataFile = path.join(CONFIG.DATA_DIR, CONFIG.METADATA_FILE);
    const metadata = {
      version: "2.0.0",
      repository: `${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}`,
      extracted_at: extractionData.metadata.extracted_at,
      last_update: extractionData.metadata.extracted_at,
      total_issues: this.extractedIssues.length,
      extraction_time_ms: Date.now() - this.startTime,
      rate_limit_used: CONFIG.GITHUB_TOKEN
        ? "authenticated"
        : "unauthenticated",
      final_rate_limit: this.rateLimit,
    };
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));

    console.log(
      `✅ Saved ${this.extractedIssues.length} issues to ${issuesFile}`
    );
    console.log(`✅ Saved metadata to ${metadataFile}`);

    return {
      issuesFile,
      metadataFile,
      totalIssues: this.extractedIssues.length,
    };
  }

  /**
   * Generate and display summary statistics
   */
  generateSummary() {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    const summary = {
      total: this.extractedIssues.length,
      open: this.extractedIssues.filter((i) => i.state === "open").length,
      closed: this.extractedIssues.filter((i) => i.state === "closed").length,
      pull_requests: this.extractedIssues.filter((i) => i.is_pull_request)
        .length,
      issues_only: this.extractedIssues.filter((i) => !i.is_pull_request)
        .length,
      with_comments: this.extractedIssues.filter((i) => i.comments > 0).length,
      unique_labels: [
        ...new Set(
          this.extractedIssues.flatMap((i) => i.labels.map((l) => l.name))
        ),
      ],
      top_authors: this.getTopAuthors(),
      extraction_time: `${Math.round(duration / 1000)}s`,
    };

    console.log("\n📊 Extraction Summary:");
    console.log("========================");
    console.log(`Total Issues: ${summary.total}`);
    console.log(`├─ Open: ${summary.open}`);
    console.log(`├─ Closed: ${summary.closed}`);
    console.log(`├─ Pull Requests: ${summary.pull_requests}`);
    console.log(`└─ Issues Only: ${summary.issues_only}`);
    console.log(`With Comments: ${summary.with_comments}`);
    console.log(`Unique Labels: ${summary.unique_labels.length}`);
    console.log(`Extraction Time: ${summary.extraction_time}`);
    console.log("");
    console.log("Top Contributors:");
    summary.top_authors.slice(0, 5).forEach((author, i) => {
      console.log(`${i + 1}. ${author.author}: ${author.count} issues`);
    });

    return summary;
  }

  /**
   * Get top issue authors
   */
  getTopAuthors() {
    const authors = {};
    this.extractedIssues.forEach((issue) => {
      const author = issue.user.login;
      authors[author] = (authors[author] || 0) + 1;
    });

    return Object.entries(authors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([author, count]) => ({ author, count }));
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log("🌟 GitHub Issues Extraction for Knowledge Base");
  console.log("==============================================\n");

  const extractor = new GitHubIssuesExtractor();

  try {
    // Extract all issues
    const issues = await extractor.extractAllIssues();

    // Save data
    const results = await extractor.saveData();

    // Generate summary
    extractor.generateSummary();

    console.log("\n🎉 Extraction completed successfully!");
    console.log(`� Data saved to: ${CONFIG.DATA_DIR}`);
    console.log(`📊 Total issues extracted: ${issues.length}`);

    if (!CONFIG.GITHUB_TOKEN) {
      console.log(
        "\n� Tip: Set GITHUB_TOKEN environment variable for higher rate limits"
      );
    }

    return results;
  } catch (error) {
    console.error("\n❌ Extraction failed:", error.message);

    if (error.message.includes("rate limit")) {
      console.error("\n💡 Rate limit suggestions:");
      console.error("   - Set GITHUB_TOKEN environment variable");
      console.error("   - Wait for rate limit to reset");
      console.error("   - Try again later");
    }

    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { GitHubIssuesExtractor, CONFIG };

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log(`
🌟 GitHub Issues Extraction for Knowledge Base
==============================================

This script extracts all issues from the teams-for-linux repository
using the standard GitHub REST API.

Usage:
  node extract-issues.js [options]

Options:
  --help, -h          Show this help message

Environment Variables:
  GITHUB_TOKEN        Personal access token for higher rate limits
                      (optional but recommended)

Examples:
  node extract-issues.js                    # Basic extraction
  GITHUB_TOKEN=ghp_xxx node extract-issues.js  # With authentication

Notes:
  - Without GITHUB_TOKEN: 60 requests/hour
  - With GITHUB_TOKEN: 5000 requests/hour
  - Script handles rate limiting automatically
  - Data saved to: data/issues/

Features:
  ✓ Standard GitHub REST API (no external dependencies)
  ✓ Automatic rate limiting and pagination handling
  ✓ Comprehensive error handling with retries
  ✓ Progress tracking and validation
  ✓ Summary statistics and reporting
        `);
    process.exit(0);
  }

  main();
}

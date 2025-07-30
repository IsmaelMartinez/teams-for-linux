#!/usr/bin/env node

/**
 * Example: GitHub Issues Extraction using Standard REST API
 *
 * This example shows how to extract GitHub issues using the standard
 * GitHub REST API instead of MCP tools, making it more accessible
 * to all contributors.
 */

const https = require("https");

class GitHubAPIExtractor {
  constructor(options = {}) {
    this.owner = options.owner || "IsmaelMartinez";
    this.repo = options.repo || "teams-for-linux";
    this.token = options.token || process.env.GITHUB_TOKEN;
    this.baseURL = "https://api.github.com";
  }

  /**
   * Make authenticated request to GitHub API
   */
  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.baseURL}${endpoint}`);

    // Add query parameters
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const options = {
      method: "GET",
      headers: {
        "User-Agent": "teams-for-linux-knowledge-base",
        Accept: "application/vnd.github.v3+json",
      },
    };

    // Add authentication if token is available
    if (this.token) {
      options.headers["Authorization"] = `token ${this.token}`;
    }

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);

            // Handle rate limiting
            if (
              res.statusCode === 403 &&
              parsed.message.includes("rate limit")
            ) {
              const resetTime = new Date(
                res.headers["x-ratelimit-reset"] * 1000
              );
              reject(new Error(`Rate limit exceeded. Resets at ${resetTime}`));
              return;
            }

            if (res.statusCode >= 400) {
              reject(
                new Error(
                  `GitHub API error: ${res.statusCode} - ${parsed.message}`
                )
              );
              return;
            }

            resolve({
              data: parsed,
              headers: res.headers,
              rateLimit: {
                remaining: parseInt(res.headers["x-ratelimit-remaining"]),
                reset: new Date(res.headers["x-ratelimit-reset"] * 1000),
              },
            });
          } catch (error) {
            reject(
              new Error(`Failed to parse JSON response: ${error.message}`)
            );
          }
        });
      });

      req.on("error", reject);
      req.end();
    });
  }

  /**
   * Extract all issues with pagination
   */
  async extractAllIssues() {
    const allIssues = [];
    let page = 1;
    const perPage = 100;

    console.log("Starting issue extraction...");

    while (true) {
      try {
        console.log(`Fetching page ${page}...`);

        const response = await this.makeRequest(
          `/repos/${this.owner}/${this.repo}/issues`,
          {
            state: "all",
            sort: "created",
            direction: "desc",
            per_page: perPage,
            page: page,
          }
        );

        const issues = response.data;

        if (issues.length === 0) {
          console.log("No more issues found");
          break;
        }

        allIssues.push(...issues);
        console.log(
          `Extracted ${issues.length} issues (Total: ${allIssues.length})`
        );
        console.log(`Rate limit remaining: ${response.rateLimit.remaining}`);

        // Check if we have all issues
        if (issues.length < perPage) {
          console.log("Reached last page");
          break;
        }

        page++;

        // Rate limiting - be nice to GitHub API
        if (response.rateLimit.remaining < 10) {
          const waitTime = response.rateLimit.reset.getTime() - Date.now();
          if (waitTime > 0) {
            console.log(
              `Rate limit low, waiting ${Math.ceil(waitTime / 1000)} seconds...`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, waitTime + 1000)
            );
          }
        } else {
          // Small delay between requests
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error on page ${page}:`, error.message);

        // Exponential backoff for retries
        if (error.message.includes("rate limit")) {
          await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
          continue;
        }

        throw error;
      }
    }

    return allIssues;
  }
}

// Example usage
async function main() {
  const extractor = new GitHubAPIExtractor();

  try {
    const issues = await extractor.extractAllIssues();
    console.log(`\nExtraction complete! Total issues: ${issues.length}`);

    // Basic statistics
    const openIssues = issues.filter((issue) => issue.state === "open");
    const closedIssues = issues.filter((issue) => issue.state === "closed");
    const pullRequests = issues.filter((issue) => issue.pull_request);

    console.log(`Open issues: ${openIssues.length}`);
    console.log(`Closed issues: ${closedIssues.length}`);
    console.log(`Pull requests: ${pullRequests.length}`);
  } catch (error) {
    console.error("Extraction failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = GitHubAPIExtractor;

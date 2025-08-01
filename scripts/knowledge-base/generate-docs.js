#!/usr/bin/env node

/**
 * Knowledge Base Documentation Generator
 *
 * This script generates comprehensive markdown documentation from categorized
 * GitHub issues, following GitHub markdown standards and creating a new
 * knowledge base separate from the existing manual one.
 *
 * Features:
 * - Generates category-based documentation
 * - Creates troubleshooting guides from real issues
 * - Includes GitHub issue references and links
 * - Follows GitHub markdown standards
 * - Creates navigation and overview pages
 */

const fs = require("fs").promises;
const path = require("path");

// Configuration
const CONFIG = {
  // Input/Output paths
  DATA_DIR: path.join(__dirname, "../../data/issues"),
  DOCS_DIR: path.join(__dirname, "../../docs"),
  OUTPUT_DIR: path.join(__dirname, "../../docs/knowledge-base-generated"),
  CATEGORIZED_FILE: "categorized.json",

  // Generation settings
  MAX_ISSUES_PER_CATEGORY: 10, // Top issues to include per category
  MIN_REACTIONS_FOR_POPULAR: 1, // Minimum reactions to consider "popular"
  INCLUDE_CLOSED_SOLUTIONS: true, // Include solutions from closed issues
};

class DocumentationGenerator {
  constructor() {
    this.categorizedData = null;
    this.issues = [];
    this.categories = {};
    this.stats = {};
    this.generatedFiles = [];
  }

  /**
   * Load categorized issues data
   */
  async loadCategorizedData() {
    try {
      const filePath = path.join(CONFIG.DATA_DIR, CONFIG.CATEGORIZED_FILE);
      const rawData = await fs.readFile(filePath, "utf8");
      this.categorizedData = JSON.parse(rawData);

      this.issues = this.categorizedData.issues || [];
      this.categories = this.categorizedData.categories || {};
      this.stats = this.categorizedData.statistics || {};

      console.log(`📊 Loaded ${this.issues.length} categorized issues`);
      return true;
    } catch (error) {
      console.error("❌ Error loading categorized data:", error.message);
      console.log("💡 Make sure to run categorize-issues.js first!");
      return false;
    }
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDirectory() {
    try {
      await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });

      // Create category subdirectories
      for (const categoryId of Object.keys(this.categories)) {
        const categoryDir = path.join(CONFIG.OUTPUT_DIR, categoryId);
        await fs.mkdir(categoryDir, { recursive: true });
      }

      console.log(`📁 Created output directory: ${CONFIG.OUTPUT_DIR}`);
      return true;
    } catch (error) {
      console.error("❌ Error creating directories:", error.message);
      return false;
    }
  }

  /**
   * Filter and sort issues by category
   */
  getIssuesByCategory(categoryId) {
    const categoryIssues = this.issues.filter(
      (issue) => issue.category && issue.category.categoryId === categoryId
    );

    // Sort by: open issues first, then by reactions, then by comments
    return categoryIssues.toSorted((a, b) => {
      // Open issues first
      if (a.state === "open" && b.state === "closed") return -1;
      if (a.state === "closed" && b.state === "open") return 1;

      // Then by total reactions
      const aReactions = a.reactions?.total_count || 0;
      const bReactions = b.reactions?.total_count || 0;
      if (aReactions !== bReactions) return bReactions - aReactions;

      // Then by comments count
      const aComments = a.comments || 0;
      const bComments = b.comments || 0;
      return bComments - aComments;
    });
  }

  /**
   * Generate markdown for issue summary
   */
  generateIssueMarkdown(issue, includeDetails = false) {
    const stateIcon = issue.state === "open" ? "🔴" : "✅";
    const reactions = issue.reactions?.total_count || 0;
    const comments = issue.comments || 0;
    const engagementInfo =
      reactions > 0 || comments > 0 ? ` (${reactions} 👍, ${comments} 💬)` : "";

    let markdown = `### ${stateIcon} [${issue.title}](${issue.html_url})${engagementInfo}\n\n`;

    if (issue.labels && issue.labels.length > 0) {
      const labelBadges = issue.labels
        .map(
          (label) =>
            `![${
              label.name
            }](https://img.shields.io/badge/-${encodeURIComponent(
              label.name
            )}-${label.color})`
        )
        .join(" ");
      markdown += `${labelBadges}\n\n`;
    }

    if (includeDetails && issue.body) {
      // Truncate body to first 300 characters for summary
      const truncatedBody =
        issue.body.length > 300
          ? issue.body.substring(0, 300) + "..."
          : issue.body;
      markdown += `${truncatedBody}\n\n`;
    }

    markdown += `**Issue:** [#${issue.number}](${issue.html_url}) | `;
    markdown += `**Author:** [@${issue.user.login}](https://github.com/${issue.user.login}) | `;
    markdown += `**Created:** ${new Date(issue.created_at).toLocaleDateString(
      "en-GB"
    )}\n\n`;

    return markdown;
  }

  /**
   * Generate category documentation
   */
  async generateCategoryDocumentation(categoryId, category) {
    const issues = this.getIssuesByCategory(categoryId);
    const topIssues = issues.slice(0, CONFIG.MAX_ISSUES_PER_CATEGORY);

    if (issues.length === 0) {
      console.log(`⚠️  No issues found for category: ${category.name}`);
      return;
    }

    let markdown = `# ${category.name}\n\n`;
    markdown += `${category.description}\n\n`;

    // Statistics
    const openIssues = issues.filter((i) => i.state === "open").length;
    const closedIssues = issues.length - openIssues;

    markdown += `## Statistics\n\n`;
    markdown += `- **Total Issues:** ${issues.length}\n`;
    markdown += `- **Open Issues:** ${openIssues}\n`;
    markdown += `- **Resolved Issues:** ${closedIssues}\n`;
    markdown += `- **Resolution Rate:** ${(
      (closedIssues / issues.length) *
      100
    ).toFixed(1)}%\n\n`;

    // Popular/Recent Issues
    if (topIssues.length > 0) {
      markdown += `## Most Relevant Issues\n\n`;
      markdown += `> [!NOTE]\n`;
      markdown += `> Issues are sorted by relevance: open issues first, then by community engagement (reactions and comments).\n\n`;

      for (const issue of topIssues) {
        markdown += this.generateIssueMarkdown(issue, true);
        markdown += "---\n\n";
      }
    }

    // Solutions from closed issues
    const closedIssuesWithSolutions = issues
      .filter((i) => i.state === "closed" && i.comments > 0)
      .slice(0, 5);

    if (closedIssuesWithSolutions.length > 0) {
      markdown += `## Common Solutions\n\n`;
      markdown += `> [!TIP]\n`;
      markdown += `> These are resolved issues that may contain helpful solutions and workarounds.\n\n`;

      for (const issue of closedIssuesWithSolutions) {
        markdown += this.generateIssueMarkdown(issue, false);
      }
    }

    // Navigation
    markdown += `## Related Categories\n\n`;
    markdown += `- [📋 Back to Knowledge Base Overview](../README.md)\n`;
    markdown += `- [🔍 View All Categories](../README.md#categories)\n`;

    // Save file in category subdirectory
    const fileName = `${categoryId}.md`;
    const categoryDir = path.join(CONFIG.OUTPUT_DIR, categoryId);
    const filePath = path.join(categoryDir, fileName);
    await fs.writeFile(filePath, markdown);

    this.generatedFiles.push(fileName);
    console.log(`📝 Generated: ${fileName} (${issues.length} issues/prs)`);
  }

  /**
   * Generate main README with overview and navigation
   */
  async generateMainReadme() {
    let markdown = `# Generated Knowledge Base\n\n`;
    markdown += `> [!IMPORTANT]\n`;
    markdown += `> This knowledge base was automatically generated from **${this.issues.length} real GitHub Issues and PRs** `;
    markdown += `on ${new Date().toLocaleDateString(
      "en-GB"
    )}. It complements the [existing manual knowledge base](../knowledge-base.md) `;
    markdown += `with data-driven insights from actual user reports.\n\n`;

    // Generation info
    markdown += `## Generation Information\n\n`;
    markdown += `- **Total Issues/PRs Analyzed:** ${this.issues.length}\n`;
    markdown += `- **Generated On:** ${new Date().toLocaleDateString(
      "en-GB"
    )}\n`;
    markdown += `- **Data Source:** [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues)\n`;
    markdown += `- **Generator Version:** 1.0.0\n\n`;

    // Quick stats
    const openIssues = this.issues.filter((i) => i.state === "open").length;
    const closedIssues = this.issues.length - openIssues;
    const pullRequests = this.issues.filter((i) => i.is_pull_request).length;
    const regularIssues = this.issues.length - pullRequests;

    markdown += `## Repository Health Overview\n\n`;
    markdown += `| Metric | Count | Percentage |\n`;
    markdown += `|--------|-------|------------|\n`;
    markdown += `| **Total Issues** | ${regularIssues} | 100% |\n`;
    markdown += `| **Open Issues** | ${openIssues} | ${(
      (openIssues / regularIssues) *
      100
    ).toFixed(1)}% |\n`;
    markdown += `| **Resolved Issues** | ${closedIssues} | ${(
      (closedIssues / regularIssues) *
      100
    ).toFixed(1)}% |\n`;
    markdown += `| **Pull Requests** | ${pullRequests} | (Development Activity) |\n\n`;

    // Categories overview
    markdown += `## Categories\n\n`;
    markdown += `The issues have been automatically categorized using pattern matching on titles, content, and labels:\n\n`;

    // Sort categories by issue count
    const categoryStats = Object.entries(this.stats.categoryDistribution || {})
      .sort(([, a], [, b]) => b - a)
      .filter(([categoryId]) => categoryId !== "other"); // Show 'other' last

    for (const [categoryId, count] of categoryStats) {
      const category = this.categories[categoryId];
      if (!category) continue;

      const percentage = ((count / this.issues.length) * 100).toFixed(1);
      const openInCategory = this.issues.filter(
        (i) => i.category?.categoryId === categoryId && i.state === "open"
      ).length;

      markdown += `### [${category.name}](${categoryId}/${categoryId}.md)\n\n`;
      markdown += `${category.description}\n\n`;
      markdown += `- **Issues:** ${count} (${percentage}% of total)\n`;
      markdown += `- **Open:** ${openInCategory}\n`;
      markdown += `- **[View Details →](${categoryId}/${categoryId}.md)**\n\n`;
    }

    // Add 'other' category last
    if (this.stats.categoryDistribution?.other) {
      const count = this.stats.categoryDistribution.other;
      const percentage = ((count / this.issues.length) * 100).toFixed(1);
      markdown += `### [Other Issues](other/other.md)\n\n`;
      markdown += `Issues that don't fit into specific categories.\n\n`;
      markdown += `- **Issues:** ${count} (${percentage}% of total)\n`;
      markdown += `- **[View Details →](other/other.md)**\n\n`;
    }

    // How to use
    markdown += `## How to Use This Knowledge Base\n\n`;
    markdown += `1. **Browse by Category:** Click on category links above to explore specific types of issues\n`;
    markdown += `2. **Check Issue Status:** 🔴 = Open issues that need attention, ✅ = Resolved issues with solutions\n`;
    markdown += `3. **Follow GitHub Links:** Click issue titles to view full discussions and solutions on GitHub\n`;
    markdown += `4. **Check Engagement:** Issues with high reactions (👍) and comments (💬) often have better solutions\n\n`;

    // Related resources
    markdown += `## Related Resources\n\n`;
    markdown += `- **[📖 Manual Knowledge Base](../knowledge-base.md)** - Curated solutions and troubleshooting guides\n`;
    markdown += `- **[🔧 GitHub Token Setup](../github-token-setup.md)** - How to set up API access for data extraction\n`;
    markdown += `- **[⚙️ Knowledge Base System](../../scripts/knowledge-base/README.md)** - Technical documentation for this system\n`;
    markdown += `- **[🐛 Report New Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues/new)** - Submit new bug reports or feature requests\n\n`;

    // Footer
    markdown += `---\n\n`;
    markdown += `> **Note:** This knowledge base is automatically generated and should be regenerated periodically to include new issues and resolutions. `;
    markdown += `For manually curated solutions, see the [main knowledge base](../knowledge-base.md).\n`;

    // Save main README
    const readmePath = path.join(CONFIG.OUTPUT_DIR, "README.md");
    await fs.writeFile(readmePath, markdown);

    this.generatedFiles.push("README.md");
    console.log(`📝 Generated main README with overview`);
  }

  /**
   * Generate summary statistics file
   */
  async generateSummaryStats() {
    const summary = {
      generation: {
        timestamp: new Date().toISOString(),
        totalIssues: this.issues.length,
        categoriesGenerated: Object.keys(this.categories).length,
        filesGenerated: this.generatedFiles.length,
      },
      repository: {
        openIssues: this.issues.filter((i) => i.state === "open").length,
        closedIssues: this.issues.filter((i) => i.state === "closed").length,
        pullRequests: this.issues.filter((i) => i.is_pull_request).length,
        totalReactions: this.issues.reduce(
          (sum, issue) => sum + (issue.reactions?.total_count || 0),
          0
        ),
        totalComments: this.issues.reduce(
          (sum, issue) => sum + (issue.comments || 0),
          0
        ),
      },
      categories: this.stats.categoryDistribution,
      topIssues: this.issues
        .toSorted(
          (a, b) =>
            (b.reactions?.total_count || 0) - (a.reactions?.total_count || 0)
        )
        .slice(0, 10)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          reactions: issue.reactions?.total_count || 0,
          comments: issue.comments || 0,
          url: issue.html_url,
        })),
    };

    const summaryPath = path.join(CONFIG.OUTPUT_DIR, "generation-summary.json");
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    console.log(`📈 Generated summary statistics`);
  }

  /**
   * Main execution method
   */
  async run() {
    console.log("📚 Knowledge Base Documentation Generator v1.0.0");
    console.log("=" * 60);

    try {
      // Load categorized data
      const loaded = await this.loadCategorizedData();
      if (!loaded) {
        process.exit(1);
      }

      // Ensure output directory
      const dirCreated = await this.ensureOutputDirectory();
      if (!dirCreated) {
        process.exit(1);
      }

      // Generate category documentation
      console.log("🔄 Generating category documentation...");
      for (const [categoryId, category] of Object.entries(this.categories)) {
        await this.generateCategoryDocumentation(categoryId, category);
      }

      // Generate main README
      console.log("📋 Generating main overview...");
      await this.generateMainReadme();

      // Generate summary statistics
      await this.generateSummaryStats();

      // Success summary
      console.log("\n✅ Documentation generation completed!");
      console.log(`📁 Output directory: ${CONFIG.OUTPUT_DIR}`);
      console.log(`📄 Generated files: ${this.generatedFiles.length}`);
      console.log("🔗 Start with: README.md for the overview");
    } catch (error) {
      console.error("❌ Fatal error:", error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new DocumentationGenerator();
  generator.run();
}

module.exports = DocumentationGenerator;

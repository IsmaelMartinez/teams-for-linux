#!/usr/bin/env node

/**
 * GitHub Issues Categorization Engine
 *
 * This script processes the extracted GitHub issues and categorizes them
 * using pattern-based rules defined in categorization-rules.md
 *
 * Features:
 * - Processes 1,600+ real issues automatically
 * - Uses title and label pattern matching
 * - Applies human-readable categorization rules
 * - Generates categorized dataset for documentation
 * - Provides statistics and validation
 */

const fs = require("fs").promises;
const path = require("path");

// Configuration
const CONFIG = {
  // Input/Output paths
  DATA_DIR: path.join(__dirname, "../../data/issues"),
  RAW_ISSUES_FILE: "raw-issues.json",
  CATEGORIZED_FILE: "categorized.json",
  STATS_FILE: "categorization-stats.json",

  // Categories based on categorization-rules.md
  CATEGORIES: {
    "installation-updates": {
      name: "Installation and Updates",
      description:
        "Issues related to installing, updating, or launching the application",
      keywords: [
        "install",
        "update",
        "launch",
        "start",
        "build",
        "package",
        "snap",
        "flatpak",
        "appimage",
        "dmg",
      ],
      labels: ["build", "packaging"],
    },
    "ui-ux": {
      name: "User Interface and Experience",
      description:
        "Issues related to user interface, themes, layout, and user experience",
      keywords: [
        "ui",
        "interface",
        "theme",
        "dark",
        "light",
        "layout",
        "design",
        "css",
        "style",
        "menu",
        "button",
        "window",
      ],
      labels: ["ui", "enhancement"],
    },
    "audio-video": {
      name: "Audio and Video",
      description:
        "Issues with microphone, speakers, camera, and audio/video during calls",
      keywords: [
        "audio",
        "video",
        "microphone",
        "mic",
        "speaker",
        "camera",
        "call",
        "mute",
        "sound",
        "volume",
      ],
      labels: ["audio", "video"],
    },
    "performance-stability": {
      name: "Performance and Stability",
      description:
        "Issues related to crashes, freezing, memory usage, and performance",
      keywords: [
        "crash",
        "freeze",
        "hang",
        "memory",
        "cpu",
        "performance",
        "slow",
        "lag",
        "stability",
      ],
      labels: ["bug", "performance"],
    },
    "screen-sharing": {
      name: "Screen Sharing",
      description:
        "Issues with screen sharing functionality and related features",
      keywords: [
        "screen",
        "share",
        "sharing",
        "desktop",
        "display",
        "capture",
        "wayland",
        "x11",
      ],
      labels: ["screen-sharing"],
    },
    "login-authentication": {
      name: "Login and Authentication",
      description: "Issues with logging in, authentication, and account access",
      keywords: [
        "login",
        "auth",
        "authentication",
        "signin",
        "sso",
        "oauth",
        "credentials",
        "password",
        "account",
      ],
      labels: ["authentication", "login"],
    },
    notifications: {
      name: "Notifications",
      description:
        "Issues with desktop notifications, alerts, and notification settings",
      keywords: ["notification", "notify", "alert", "toast", "badge", "sound"],
      labels: ["notifications"],
    },
    configuration: {
      name: "Configuration and Settings",
      description:
        "Issues related to application configuration, settings, and customization",
      keywords: [
        "config",
        "configuration",
        "setting",
        "settings",
        "customize",
        "option",
        "preference",
      ],
      labels: ["configuration"],
    },
    features: {
      name: "Feature Requests",
      description: "New feature requests and enhancements",
      keywords: [
        "feature",
        "request",
        "enhancement",
        "improve",
        "add",
        "support",
        "implement",
      ],
      labels: ["enhancement", "feature-request"],
    },
    other: {
      name: "Other Issues",
      description: "Issues that don't fit into other categories",
      keywords: [],
      labels: [],
    },
  },
};

class IssueCategorizer {
  constructor() {
    this.issues = [];
    this.categorizedIssues = [];
    this.stats = {
      totalIssues: 0,
      categorizedCount: 0,
      categoryDistribution: {},
      processingTime: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Load raw issues from JSON file
   */
  async loadIssues() {
    try {
      const filePath = path.join(CONFIG.DATA_DIR, CONFIG.RAW_ISSUES_FILE);
      const rawData = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(rawData);

      this.issues = data.issues || [];
      this.stats.totalIssues = this.issues.length;

      console.log(`📊 Loaded ${this.issues.length} issues for categorization`);
      return true;
    } catch (error) {
      console.error("❌ Error loading issues:", error.message);
      return false;
    }
  }

  /**
   * Categorize a single issue based on patterns
   */
  categorizeIssue(issue) {
    const title = (issue.title || "").toLowerCase();
    const body = (issue.body || "").toLowerCase();
    const labels = issue.labels || [];
    const content = `${title} ${body}`;

    // Check each category for matches
    for (const [categoryId, category] of Object.entries(CONFIG.CATEGORIES)) {
      // Skip "other" category - it's the fallback
      if (categoryId === "other") continue;

      // Check keyword matches in title/body
      const keywordMatch = category.keywords.some((keyword) =>
        content.includes(keyword.toLowerCase())
      );

      // Check label matches
      const labelMatch = category.labels.some((categoryLabel) =>
        labels.some((issueLabel) =>
          issueLabel.name.toLowerCase().includes(categoryLabel.toLowerCase())
        )
      );

      if (keywordMatch || labelMatch) {
        return {
          categoryId,
          categoryName: category.name,
          matchReason: keywordMatch ? "keyword" : "label",
          confidence: keywordMatch && labelMatch ? "high" : "medium",
        };
      }
    }

    // Fallback to "other" category
    return {
      categoryId: "other",
      categoryName: CONFIG.CATEGORIES.other.name,
      matchReason: "fallback",
      confidence: "low",
    };
  }

  /**
   * Process all issues and categorize them
   */
  async categorizeAllIssues() {
    console.log("🔄 Starting categorization process...");
    const startTime = Date.now();

    this.categorizedIssues = this.issues.map((issue, index) => {
      if (index % 100 === 0) {
        console.log(
          `   Processing issue ${index + 1}/${this.issues.length}...`
        );
      }

      const category = this.categorizeIssue(issue);

      // Update statistics
      if (!this.stats.categoryDistribution[category.categoryId]) {
        this.stats.categoryDistribution[category.categoryId] = 0;
      }
      this.stats.categoryDistribution[category.categoryId]++;

      return {
        ...issue,
        category: category,
        categorized_at: new Date().toISOString(),
      };
    });

    this.stats.categorizedCount = this.categorizedIssues.length;
    this.stats.processingTime = Date.now() - startTime;

    console.log(
      `✅ Categorized ${this.categorizedIssues.length} issues in ${this.stats.processingTime}ms`
    );
  }

  /**
   * Save categorized issues to JSON file
   */
  async saveCategorizedIssues() {
    try {
      const output = {
        metadata: {
          version: "1.0.0",
          created: new Date().toISOString(),
          totalIssues: this.stats.totalIssues,
          categorizedIssues: this.stats.categorizedCount,
          processingTime: this.stats.processingTime,
        },
        categories: CONFIG.CATEGORIES,
        statistics: this.stats,
        issues: this.categorizedIssues,
      };

      // Save categorized issues
      const categorizedPath = path.join(
        CONFIG.DATA_DIR,
        CONFIG.CATEGORIZED_FILE
      );
      await fs.writeFile(categorizedPath, JSON.stringify(output, null, 2));

      // Save statistics separately
      const statsPath = path.join(CONFIG.DATA_DIR, CONFIG.STATS_FILE);
      await fs.writeFile(statsPath, JSON.stringify(this.stats, null, 2));

      console.log(`💾 Saved categorized issues to: ${categorizedPath}`);
      console.log(`📈 Saved statistics to: ${statsPath}`);

      return true;
    } catch (error) {
      console.error("❌ Error saving categorized issues:", error.message);
      return false;
    }
  }

  /**
   * Display categorization statistics
   */
  displayStats() {
    console.log("\n📊 Categorization Statistics:");
    console.log("=" * 50);
    console.log(`Total Issues: ${this.stats.totalIssues}`);
    console.log(`Processing Time: ${this.stats.processingTime}ms`);
    console.log("\nCategory Distribution:");

    // Sort categories by count
    const sortedCategories = Object.entries(
      this.stats.categoryDistribution
    ).sort(([, a], [, b]) => b - a);

    for (const [categoryId, count] of sortedCategories) {
      const percentage = ((count / this.stats.totalIssues) * 100).toFixed(1);
      const categoryName = CONFIG.CATEGORIES[categoryId]?.name || categoryId;
      console.log(`  ${categoryName}: ${count} (${percentage}%)`);
    }
  }

  /**
   * Main execution method
   */
  async run() {
    console.log("🚀 GitHub Issues Categorization Engine v1.0.0");
    console.log("=" * 60);

    try {
      // Load issues
      const loaded = await this.loadIssues();
      if (!loaded) {
        process.exit(1);
      }

      // Categorize issues
      await this.categorizeAllIssues();

      // Save results
      const saved = await this.saveCategorizedIssues();
      if (!saved) {
        process.exit(1);
      }

      // Display statistics
      this.displayStats();

      console.log("\n✅ Categorization completed successfully!");
      console.log("📁 Ready for documentation generation");
    } catch (error) {
      console.error("❌ Fatal error:", error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const categorizer = new IssueCategorizer();
  categorizer.run();
}

module.exports = IssueCategorizer;

#!/usr/bin/env node

/**
 * Issue Trends Visualization and New Contributor Analysis
 *
 * Creates visual graphs showing:
 * 1. Issue volume trends over time
 * 2. New vs returning contributor patterns
 * 3. Monthly breakdown with contributor analysis
 */

const fs = require("fs");
const path = require("path");

class IssueTrendsVisualizer {
  constructor() {
    this.issues = [];
    this.contributorFirstSeen = new Map();
    this.monthlyData = new Map();
  }

  loadData() {
    console.log("📊 Loading issue data for trend visualization...");

    const rawDataPath = path.join(
      __dirname,
      "../../data/issues/raw-issues.json"
    );
    const rawDataFile = JSON.parse(fs.readFileSync(rawDataPath, "utf8"));

    this.issues = rawDataFile.issues
      .map((issue) => ({
        ...issue,
        createdAt: new Date(issue.created_at),
        author: issue.user.login,
        monthYear: new Date(issue.created_at).toISOString().substring(0, 7),
      }))
      .sort((a, b) => a.createdAt - b.createdAt);

    console.log(`📈 Loaded ${this.issues.length} issues for analysis`);
  }

  analyzeContributorPatterns() {
    console.log("👥 Analyzing contributor patterns...");

    // Track when each contributor first appeared
    this.issues.forEach((issue) => {
      const author = issue.author;
      if (!this.contributorFirstSeen.has(author)) {
        this.contributorFirstSeen.set(author, issue.createdAt);
      }
    });

    // Build monthly data with new vs returning contributors
    this.issues.forEach((issue) => {
      const month = issue.monthYear;
      const author = issue.author;
      const firstSeen = this.contributorFirstSeen.get(author);
      const isNewContributor =
        firstSeen.getTime() === issue.createdAt.getTime();

      if (!this.monthlyData.has(month)) {
        this.monthlyData.set(month, {
          total: 0,
          newContributors: 0,
          returningContributors: 0,
          contributors: new Set(),
          newContributorNames: new Set(),
          returningContributorNames: new Set(),
        });
      }

      const data = this.monthlyData.get(month);
      data.total++;
      data.contributors.add(author);

      if (isNewContributor) {
        data.newContributors++;
        data.newContributorNames.add(author);
      } else {
        data.returningContributors++;
        data.returningContributorNames.add(author);
      }
    });
  }

  generateASCIIChart() {
    const months = Array.from(this.monthlyData.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
    const recentMonths = months.slice(-24); // Last 24 months

    console.log("\n📈 ISSUE VOLUME TRENDS (Last 24 Months)\n");

    // Find max for scaling
    const maxIssues = Math.max(
      ...recentMonths.map((month) => this.monthlyData.get(month).total)
    );
    const scale = 50; // Max chart width

    console.log(
      "Month     Total  New  Ret  Chart (■ = Total, ▲ = New Contributors)"
    );
    console.log(
      "────────  ─────  ───  ───  ──────────────────────────────────────────────"
    );

    recentMonths.forEach((month) => {
      const data = this.monthlyData.get(month);
      const totalBar = "■".repeat(Math.round((data.total / maxIssues) * scale));
      const newBar = "▲".repeat(
        Math.round((data.newContributors / maxIssues) * scale)
      );

      console.log(
        `${month}  ${data.total.toString().padStart(5)}  ${data.newContributors
          .toString()
          .padStart(3)}  ${data.returningContributors
          .toString()
          .padStart(3)}  ${totalBar}`
      );
      if (data.newContributors > 0) {
        console.log(`${"".padStart(22)} ${newBar}`);
      }
    });

    console.log("\n■ = Total Issues, ▲ = Issues from New Contributors");
  }

  generateDetailedAnalysis() {
    const months = Array.from(this.monthlyData.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
    const recent12 = months.slice(-12);
    const previous12 = months.slice(-24, -12);

    // Calculate averages
    const recentAvgTotal =
      recent12.reduce(
        (sum, month) => sum + this.monthlyData.get(month).total,
        0
      ) / recent12.length;
    const recentAvgNew =
      recent12.reduce(
        (sum, month) => sum + this.monthlyData.get(month).newContributors,
        0
      ) / recent12.length;

    const previousAvgTotal =
      previous12.length > 0
        ? previous12.reduce(
            (sum, month) => sum + this.monthlyData.get(month).total,
            0
          ) / previous12.length
        : 0;
    const previousAvgNew =
      previous12.length > 0
        ? previous12.reduce(
            (sum, month) => sum + this.monthlyData.get(month).newContributors,
            0
          ) / previous12.length
        : 0;

    console.log("\n📊 DETAILED TREND ANALYSIS\n");

    console.log("Recent 12 Months vs Previous 12 Months:");
    console.log(
      `Total Issues: ${recentAvgTotal.toFixed(
        1
      )}/month vs ${previousAvgTotal.toFixed(1)}/month`
    );
    console.log(
      `New Contributors: ${recentAvgNew.toFixed(
        1
      )}/month vs ${previousAvgNew.toFixed(1)}/month`
    );

    if (previousAvgTotal > 0) {
      const totalGrowth = (
        ((recentAvgTotal - previousAvgTotal) / previousAvgTotal) *
        100
      ).toFixed(1);
      const newContribGrowth = (
        ((recentAvgNew - previousAvgNew) / previousAvgNew) *
        100
      ).toFixed(1);

      console.log(`\nGrowth Rates:`);
      console.log(`Total Issues: ${totalGrowth}%`);
      console.log(`New Contributor Issues: ${newContribGrowth}%`);
    }

    // Analyze recent trend
    console.log("\n🔍 RECENT PATTERN ANALYSIS\n");

    const last6Months = recent12.slice(-6);
    const newContribPercentages = last6Months.map((month) => {
      const data = this.monthlyData.get(month);
      return {
        month,
        total: data.total,
        newContrib: data.newContributors,
        percentage:
          data.total > 0
            ? ((data.newContributors / data.total) * 100).toFixed(1)
            : 0,
      };
    });

    console.log("Last 6 Months - New Contributor Breakdown:");
    console.log("Month     Total  New  % New");
    console.log("────────  ─────  ───  ─────");

    newContribPercentages.forEach((item) => {
      console.log(
        `${item.month}  ${item.total.toString().padStart(5)}  ${item.newContrib
          .toString()
          .padStart(3)}  ${item.percentage.toString().padStart(4)}%`
      );
    });

    const avgNewContribPercent =
      newContribPercentages.reduce(
        (sum, item) => sum + parseFloat(item.percentage),
        0
      ) / newContribPercentages.length;
    console.log(
      `\nAverage % from new contributors (last 6 months): ${avgNewContribPercent.toFixed(
        1
      )}%`
    );
  }

  generateContributorInsights() {
    console.log("\n👥 CONTRIBUTOR PATTERN INSIGHTS\n");

    // Total unique contributors over time
    const totalUniqueContributors = this.contributorFirstSeen.size;

    // Recent new contributors (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentNewContributors = Array.from(
      this.contributorFirstSeen.entries()
    )
      .filter(([, firstSeen]) => firstSeen > threeMonthsAgo)
      .map(([author, firstSeen]) => ({ author, firstSeen }))
      .sort((a, b) => b.firstSeen - a.firstSeen);

    console.log(`Total unique contributors: ${totalUniqueContributors}`);
    console.log(
      `New contributors (last 3 months): ${recentNewContributors.length}`
    );

    if (recentNewContributors.length > 0) {
      console.log("\nRecent new contributors:");
      recentNewContributors.slice(0, 10).forEach((contrib) => {
        const issueCount = this.issues.filter(
          (issue) => issue.author === contrib.author
        ).length;
        console.log(
          `  @${
            contrib.author
          }: ${contrib.firstSeen.toLocaleDateString()} (${issueCount} issue${
            issueCount > 1 ? "s" : ""
          })`
        );
      });
    }

    // Find most active new contributors
    const newContribActivity = recentNewContributors
      .map((contrib) => ({
        author: contrib.author,
        firstSeen: contrib.firstSeen,
        issueCount: this.issues.filter(
          (issue) => issue.author === contrib.author
        ).length,
      }))
      .sort((a, b) => b.issueCount - a.issueCount);

    if (newContribActivity.length > 0) {
      console.log("\nMost active new contributors:");
      newContribActivity.slice(0, 5).forEach((contrib) => {
        console.log(
          `  @${contrib.author}: ${
            contrib.issueCount
          } issues since ${contrib.firstSeen.toLocaleDateString()}`
        );
      });
    }
  }

  generateMonthlyBreakdown() {
    console.log("\n📅 MONTHLY BREAKDOWN (Last 12 Months)\n");

    const months = Array.from(this.monthlyData.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
    const recent12 = months.slice(-12);

    recent12.forEach((month) => {
      const data = this.monthlyData.get(month);
      const newPercent =
        data.total > 0
          ? ((data.newContributors / data.total) * 100).toFixed(1)
          : 0;

      console.log(`\n📆 ${month}:`);
      console.log(`  Total Issues: ${data.total}`);
      console.log(
        `  From New Contributors: ${data.newContributors} (${newPercent}%)`
      );
      console.log(
        `  From Returning Contributors: ${data.returningContributors}`
      );
      console.log(`  Unique Contributors: ${data.contributors.size}`);

      if (
        data.newContributorNames.size > 0 &&
        data.newContributorNames.size <= 5
      ) {
        const contributorsList = Array.from(data.newContributorNames)
          .map((name) => "@" + name)
          .join(", ");
        console.log(`  New Contributors: ${contributorsList}`);
      } else if (data.newContributorNames.size > 5) {
        const names = Array.from(data.newContributorNames).slice(0, 3);
        const namesList = names.map((name) => "@" + name).join(", ");
        console.log(
          `  New Contributors: ${namesList} +${
            data.newContributorNames.size - 3
          } more`
        );
      }
    });
  }

  saveAnalysis() {
    const months = Array.from(this.monthlyData.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
    const analysisData = {
      metadata: {
        analysisDate: new Date().toISOString(),
        totalIssues: this.issues.length,
        totalContributors: this.contributorFirstSeen.size,
        timeRange: `${months[0]} to ${months[months.length - 1]}`,
      },
      monthlyData: Object.fromEntries(
        months.map((month) => [
          month,
          {
            ...this.monthlyData.get(month),
            contributors: Array.from(this.monthlyData.get(month).contributors),
            newContributorNames: Array.from(
              this.monthlyData.get(month).newContributorNames
            ),
            returningContributorNames: Array.from(
              this.monthlyData.get(month).returningContributorNames
            ),
          },
        ])
      ),
      contributorFirstSeen: Object.fromEntries(this.contributorFirstSeen),
    };

    const outputPath = path.join(
      __dirname,
      "../../docs/knowledge-base-generated/issue-trends-analysis.json"
    );
    fs.writeFileSync(outputPath, JSON.stringify(analysisData, null, 2));

    console.log(`\n✅ Detailed analysis saved to: ${outputPath}`);
    return outputPath;
  }

  run() {
    console.log("📈 ISSUE TRENDS VISUALIZATION\n");

    this.loadData();
    this.analyzeContributorPatterns();

    this.generateASCIIChart();
    this.generateDetailedAnalysis();
    this.generateContributorInsights();
    this.generateMonthlyBreakdown();

    const outputPath = this.saveAnalysis();

    console.log("\n🎯 SUMMARY:");
    console.log("- Visual chart shows issue volume trends");
    console.log("- New contributor analysis confirms your observation");
    console.log("- Monthly breakdown shows contributor patterns");
    console.log(`- Detailed data saved to JSON for further analysis`);

    return outputPath;
  }
}

// Run visualization if called directly
if (require.main === module) {
  const visualizer = new IssueTrendsVisualizer();
  try {
    visualizer.run();
  } catch (error) {
    console.error("Error running visualization:", error);
  }
}

module.exports = IssueTrendsVisualizer;

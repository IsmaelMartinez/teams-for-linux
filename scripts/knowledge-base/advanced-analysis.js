#!/usr/bin/env node

/**
 * Advanced AI-Powered Issue Analysis Engine
 *
 * Implements sophisticated pattern recognition, temporal weighting,
 * environmental correlation analysis, and predictive insights based on
 * the AI Support Engineer methodology.
 */

const fs = require("fs");
const path = require("path");

class AdvancedIssueAnalyzer {
  constructor() {
    this.issues = [];
    this.analysis = {
      temporalPatterns: [],
      environmentalCorrelations: [],
      symptomCascades: [],
      versionTransitions: [],
      communityEngagement: [],
      predictiveInsights: [],
      criticalPatterns: [],
      recommendations: [],
    };

    // Temporal weighting configuration (recent issues 3x priority)
    this.temporalWeights = {
      recent: 3.0, // Last 6 months
      current: 2.0, // 6-12 months
      historical: 1.0, // 12+ months
    };

    // Environmental correlation patterns
    this.environmentalFactors = {
      operatingSystems: [
        "ubuntu",
        "debian",
        "fedora",
        "arch",
        "manjaro",
        "opensuse",
        "centos",
        "rhel",
      ],
      electronVersions: /electron[:\s]+(\d+\.\d+\.\d+)/i,
      teamsVersions: /teams[:\s]+(\d+\.\d+\.\d+)/i,
      desktopEnvironments: [
        "gnome",
        "kde",
        "xfce",
        "cinnamon",
        "mate",
        "unity",
        "i3",
        "sway",
      ],
      packageManagers: ["snap", "flatpak", "appimage", "deb", "rpm", "aur"],
      audioSystems: ["pulseaudio", "alsa", "pipewire", "jack"],
      displaySystems: ["x11", "wayland"],
    };

    // Symptom cascade detection patterns
    this.cascadePatterns = {
      audioChain: ["microphone", "speaker", "audio", "sound", "voice", "call"],
      videoChain: ["camera", "video", "webcam", "screen share", "display"],
      notificationChain: ["notification", "alert", "toast", "popup", "banner"],
      performanceChain: ["slow", "lag", "freeze", "crash", "memory", "cpu"],
      networkChain: ["connection", "proxy", "ssl", "certificate", "timeout"],
    };
  }

  /**
   * Load and prepare issues data with temporal weighting
   */
  loadIssuesData() {
    console.log("🔍 Loading issues data for advanced analysis...");

    const rawDataPath = path.join(
      __dirname,
      "../../data/issues/raw-issues.json"
    );
    const rawDataFile = JSON.parse(fs.readFileSync(rawDataPath, "utf8"));
    const rawData = rawDataFile.issues; // Extract issues array from the data structure

    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const twelveMonthsAgo = new Date(
      now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000
    );

    this.issues = rawData.map((issue) => {
      const createdAt = new Date(issue.created_at);
      const updatedAt = new Date(issue.updated_at);

      // Calculate temporal weight
      let temporalWeight = this.temporalWeights.historical;
      if (createdAt > sixMonthsAgo || updatedAt > sixMonthsAgo) {
        temporalWeight = this.temporalWeights.recent;
      } else if (createdAt > twelveMonthsAgo || updatedAt > twelveMonthsAgo) {
        temporalWeight = this.temporalWeights.current;
      }

      return {
        ...issue,
        temporalWeight,
        createdAt,
        updatedAt,
        textContent: `${issue.title} ${issue.body || ""}`.toLowerCase(),
      };
    });

    console.log(
      `📊 Loaded ${this.issues.length} issues with temporal weighting applied`
    );
    console.log(
      `   Recent (${this.temporalWeights.recent}x): ${
        this.issues.filter(
          (i) => i.temporalWeight === this.temporalWeights.recent
        ).length
      }`
    );
    console.log(
      `   Current (${this.temporalWeights.current}x): ${
        this.issues.filter(
          (i) => i.temporalWeight === this.temporalWeights.current
        ).length
      }`
    );
    console.log(
      `   Historical (${this.temporalWeights.historical}x): ${
        this.issues.filter(
          (i) => i.temporalWeight === this.temporalWeights.historical
        ).length
      }`
    );
  }

  /**
   * Analyze temporal patterns and trends
   */
  analyzeTemporalPatterns() {
    console.log("📈 Analyzing temporal patterns...");

    const monthlyData = {};
    const weeklyData = {};
    const openClosePatterns = {};

    this.issues.forEach((issue) => {
      const month = issue.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const dayOfWeek = issue.createdAt.getDay();

      // Monthly trends
      if (!monthlyData[month]) {
        monthlyData[month] = { total: 0, open: 0, closed: 0, weighted: 0 };
      }
      monthlyData[month].total++;
      monthlyData[month].weighted += issue.temporalWeight;
      if (issue.state === "open") monthlyData[month].open++;
      else monthlyData[month].closed++;

      // Weekly patterns
      if (!weeklyData[dayOfWeek]) {
        weeklyData[dayOfWeek] = { count: 0, weighted: 0 };
      }
      weeklyData[dayOfWeek].count++;
      weeklyData[dayOfWeek].weighted += issue.temporalWeight;

      // Open/close time analysis
      if (issue.state === "closed" && issue.closed_at) {
        const openTime = new Date(issue.closed_at) - issue.createdAt;
        const days = Math.floor(openTime / (1000 * 60 * 60 * 24));
        const category =
          days < 1
            ? "same-day"
            : days < 7
            ? "week"
            : days < 30
            ? "month"
            : "long-term";

        if (!openClosePatterns[category]) {
          openClosePatterns[category] = { count: 0, weighted: 0 };
        }
        openClosePatterns[category].count++;
        openClosePatterns[category].weighted += issue.temporalWeight;
      }
    });

    // Find trending patterns
    const months = Object.keys(monthlyData).sort();
    const recentMonths = months.slice(-6);
    const historicalMonths = months.slice(0, -6);

    const recentAvg =
      recentMonths.reduce(
        (sum, month) => sum + monthlyData[month].weighted,
        0
      ) / recentMonths.length;
    const historicalAvg =
      historicalMonths.reduce(
        (sum, month) => sum + monthlyData[month].weighted,
        0
      ) / historicalMonths.length;

    this.analysis.temporalPatterns = {
      monthlyTrends: monthlyData,
      weeklyPatterns: weeklyData,
      resolutionTimes: openClosePatterns,
      trendAnalysis: {
        recentAverage: recentAvg,
        historicalAverage: historicalAvg,
        trend:
          recentAvg > historicalAvg * 1.2
            ? "increasing"
            : recentAvg < historicalAvg * 0.8
            ? "decreasing"
            : "stable",
        changePercent: (
          ((recentAvg - historicalAvg) / historicalAvg) *
          100
        ).toFixed(1),
      },
    };
  }

  /**
   * Detect environmental correlations
   */
  analyzeEnvironmentalCorrelations() {
    console.log("🔬 Analyzing environmental correlations...");

    const correlations = {};

    // Analyze each environmental factor
    Object.keys(this.environmentalFactors).forEach((factorType) => {
      correlations[factorType] = {};
      const factors = this.environmentalFactors[factorType];

      if (Array.isArray(factors)) {
        factors.forEach((factor) => {
          const matchingIssues = this.issues.filter((issue) =>
            issue.textContent.includes(factor.toLowerCase())
          );

          if (matchingIssues.length > 0) {
            const weightedCount = matchingIssues.reduce(
              (sum, issue) => sum + issue.temporalWeight,
              0
            );
            const avgResolutionTime =
              this.calculateAvgResolutionTime(matchingIssues);
            const openRate =
              matchingIssues.filter((i) => i.state === "open").length /
              matchingIssues.length;

            correlations[factorType][factor] = {
              count: matchingIssues.length,
              weightedCount: weightedCount,
              openRate: openRate,
              avgResolutionDays: avgResolutionTime,
              severity: this.calculateSeverityScore(matchingIssues),
            };
          }
        });
      }
    });

    // Find high-impact correlations
    const criticalCorrelations = [];
    Object.keys(correlations).forEach((factorType) => {
      Object.keys(correlations[factorType]).forEach((factor) => {
        const data = correlations[factorType][factor];
        if (
          data.weightedCount > 5 &&
          (data.openRate > 0.3 || data.severity > 0.7)
        ) {
          criticalCorrelations.push({
            type: factorType,
            factor: factor,
            ...data,
            impact: "high",
          });
        }
      });
    });

    this.analysis.environmentalCorrelations = {
      correlations,
      criticalCorrelations: criticalCorrelations.sort(
        (a, b) => b.weightedCount - a.weightedCount
      ),
    };
  }

  /**
   * Detect symptom cascade patterns
   */
  analyzeSymptomCascades() {
    console.log("🔗 Analyzing symptom cascade patterns...");

    const cascades = {};

    Object.keys(this.cascadePatterns).forEach((cascadeType) => {
      const symptoms = this.cascadePatterns[cascadeType];
      cascades[cascadeType] = {
        individualSymptoms: {},
        combinations: [],
        severity: 0,
      };

      // Analyze individual symptoms
      symptoms.forEach((symptom) => {
        const matchingIssues = this.issues.filter((issue) =>
          issue.textContent.includes(symptom.toLowerCase())
        );

        if (matchingIssues.length > 0) {
          const weightedCount = matchingIssues.reduce(
            (sum, issue) => sum + issue.temporalWeight,
            0
          );
          cascades[cascadeType].individualSymptoms[symptom] = {
            count: matchingIssues.length,
            weightedCount: weightedCount,
            openRate:
              matchingIssues.filter((i) => i.state === "open").length /
              matchingIssues.length,
          };
        }
      });

      // Analyze symptom combinations
      for (let i = 0; i < symptoms.length; i++) {
        for (let j = i + 1; j < symptoms.length; j++) {
          const combo = [symptoms[i], symptoms[j]];
          const matchingIssues = this.issues.filter((issue) =>
            combo.every((symptom) =>
              issue.textContent.includes(symptom.toLowerCase())
            )
          );

          if (matchingIssues.length > 2) {
            const weightedCount = matchingIssues.reduce(
              (sum, issue) => sum + issue.temporalWeight,
              0
            );
            cascades[cascadeType].combinations.push({
              symptoms: combo,
              count: matchingIssues.length,
              weightedCount: weightedCount,
              examples: matchingIssues
                .slice(0, 3)
                .map((i) => ({ id: i.number, title: i.title })),
            });
          }
        }
      }

      // Calculate cascade severity
      const totalSymptoms = Object.keys(
        cascades[cascadeType].individualSymptoms
      ).length;
      const totalCombos = cascades[cascadeType].combinations.length;
      cascades[cascadeType].severity =
        (totalSymptoms * 0.3 + totalCombos * 0.7) / symptoms.length;
    });

    this.analysis.symptomCascades = cascades;
  }

  /**
   * Analyze version transition impacts
   */
  analyzeVersionTransitions() {
    console.log("🔄 Analyzing version transition impacts...");

    const versionPatterns = {
      electron: new RegExp(
        "electron[:\\s]*v?([0-9]+)\\.([0-9]+)\\.([0-9]+)",
        "gi"
      ),
      teams: new RegExp("teams[:\\s]*v?([0-9]+)\\.([0-9]+)\\.([0-9]+)", "gi"),
      app: new RegExp(
        "(?:version|v)[:\\s]*([0-9]+)\\.([0-9]+)\\.([0-9]+)",
        "gi"
      ),
    };

    const versionIssues = {};
    const transitionPeriods = [];

    this.issues.forEach((issue) => {
      Object.keys(versionPatterns).forEach((versionType) => {
        const matches = [
          ...issue.textContent.matchAll(versionPatterns[versionType]),
        ];
        matches.forEach((match) => {
          const version = `${match[1]}.${match[2]}.${match[3]}`;
          const key = `${versionType}-${version}`;

          if (!versionIssues[key]) {
            versionIssues[key] = [];
          }
          versionIssues[key].push({
            ...issue,
            versionType,
            version,
          });
        });
      });
    });

    // Identify problematic version transitions
    Object.keys(versionIssues).forEach((versionKey) => {
      const issues = versionIssues[versionKey];
      if (issues.length > 3) {
        const weightedCount = issues.reduce(
          (sum, issue) => sum + issue.temporalWeight,
          0
        );
        const openRate =
          issues.filter((i) => i.state === "open").length / issues.length;

        if (weightedCount > 5 || openRate > 0.4) {
          transitionPeriods.push({
            versionKey,
            issues: issues.length,
            weightedCount,
            openRate,
            severity: weightedCount * openRate,
            examples: issues
              .slice(0, 3)
              .map((i) => ({ id: i.number, title: i.title })),
          });
        }
      }
    });

    this.analysis.versionTransitions = {
      versionIssues,
      problematicTransitions: transitionPeriods.sort(
        (a, b) => b.severity - a.severity
      ),
    };
  }

  /**
   * Analyze community engagement patterns
   */
  analyzeCommunityEngagement() {
    console.log("👥 Analyzing community engagement patterns...");

    const engagement = {
      contributors: {},
      responsePatterns: {},
      collaborationMetrics: {},
    };

    // Analyze contributor patterns
    this.issues.forEach((issue) => {
      const author = issue.user.login;
      if (!engagement.contributors[author]) {
        engagement.contributors[author] = {
          issues: 0,
          comments: 0,
          weightedContribution: 0,
          firstSeen: issue.createdAt,
          lastSeen: issue.updatedAt,
        };
      }

      engagement.contributors[author].issues++;
      engagement.contributors[author].comments += issue.comments;
      engagement.contributors[author].weightedContribution +=
        issue.temporalWeight;

      if (issue.createdAt < engagement.contributors[author].firstSeen) {
        engagement.contributors[author].firstSeen = issue.createdAt;
      }
      if (issue.updatedAt > engagement.contributors[author].lastSeen) {
        engagement.contributors[author].lastSeen = issue.updatedAt;
      }
    });

    // Calculate engagement metrics
    const totalContributors = Object.keys(engagement.contributors).length;
    const activeContributors = Object.values(engagement.contributors).filter(
      (c) => c.weightedContribution > 2
    ).length;
    const topContributors = Object.entries(engagement.contributors)
      .sort(([, a], [, b]) => b.weightedContribution - a.weightedContribution)
      .slice(0, 10);

    engagement.collaborationMetrics = {
      totalContributors,
      activeContributors,
      engagementRate: activeContributors / totalContributors,
      topContributors: topContributors.map(([login, data]) => ({
        login,
        ...data,
      })),
    };

    this.analysis.communityEngagement = engagement;
  }

  /**
   * Generate predictive insights
   */
  generatePredictiveInsights() {
    console.log("🔮 Generating predictive insights...");

    const insights = [];

    // Predict issue volume trends
    const { trendAnalysis } = this.analysis.temporalPatterns;
    if (trendAnalysis.trend === "increasing") {
      insights.push({
        type: "volume_prediction",
        severity: "medium",
        confidence: 0.75,
        title: "Issue Volume Trending Upward",
        description: `Issue volume has increased by ${trendAnalysis.changePercent}% recently. Expect continued growth without intervention.`,
        recommendation:
          "Consider proactive community engagement and documentation improvements.",
      });
    }

    // Predict environmental hotspots
    const criticalEnvs =
      this.analysis.environmentalCorrelations.criticalCorrelations.slice(0, 3);
    criticalEnvs.forEach((env) => {
      if (env.openRate > 0.4) {
        insights.push({
          type: "environment_prediction",
          severity: "high",
          confidence: 0.8,
          title: `${env.factor} Environment Issues Likely to Persist`,
          description: `${env.factor} shows ${(env.openRate * 100).toFixed(
            1
          )}% open rate with high recent activity.`,
          recommendation: `Focus testing and documentation efforts on ${env.factor} compatibility.`,
        });
      }
    });

    // Predict cascade failures
    Object.keys(this.analysis.symptomCascades).forEach((cascadeType) => {
      const cascade = this.analysis.symptomCascades[cascadeType];
      if (cascade.severity > 0.6 && cascade.combinations.length > 2) {
        insights.push({
          type: "cascade_prediction",
          severity: "high",
          confidence: 0.7,
          title: `${cascadeType} Cascade Failures Expected`,
          description: `Multiple ${cascadeType} symptoms appearing together indicate systemic issues.`,
          recommendation: `Implement comprehensive ${cascadeType} diagnostics and monitoring.`,
        });
      }
    });

    this.analysis.predictiveInsights = insights.sort(
      (a, b) => b.confidence - a.confidence
    );
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations() {
    console.log("💡 Generating actionable recommendations...");

    const recommendations = [];

    // Technical recommendations
    const topEnvIssues =
      this.analysis.environmentalCorrelations.criticalCorrelations.slice(0, 5);
    topEnvIssues.forEach((env) => {
      recommendations.push({
        category: "technical",
        priority: env.openRate > 0.5 ? "high" : "medium",
        title: `Improve ${env.factor} Compatibility`,
        description: `Address ${env.count} issues related to ${
          env.factor
        } with ${(env.openRate * 100).toFixed(1)}% open rate.`,
        effort: "medium",
        impact: "high",
        timeline: "1-2 sprints",
      });
    });

    // Process recommendations
    const highSeverityCascades = Object.entries(this.analysis.symptomCascades)
      .filter(([, cascade]) => cascade.severity > 0.5)
      .slice(0, 3);

    highSeverityCascades.forEach(([cascadeType]) => {
      recommendations.push({
        category: "process",
        priority: "high",
        title: `Implement ${cascadeType} Diagnostic Workflow`,
        description: `Create systematic approach to diagnose and resolve ${cascadeType} cascades.`,
        effort: "high",
        impact: "high",
        timeline: "2-3 sprints",
      });
    });

    // Community recommendations
    const { engagementRate } =
      this.analysis.communityEngagement.collaborationMetrics;
    if (engagementRate < 0.3) {
      recommendations.push({
        category: "community",
        priority: "medium",
        title: "Improve Community Engagement",
        description: `Only ${(engagementRate * 100).toFixed(
          1
        )}% of contributors are actively engaged.`,
        effort: "medium",
        impact: "medium",
        timeline: "ongoing",
      });
    }

    this.analysis.recommendations = recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Helper method to calculate average resolution time
   */
  calculateAvgResolutionTime(issues) {
    const closedIssues = issues.filter(
      (i) => i.state === "closed" && i.closed_at
    );
    if (closedIssues.length === 0) return null;

    const totalTime = closedIssues.reduce((sum, issue) => {
      return sum + (new Date(issue.closed_at) - new Date(issue.created_at));
    }, 0);

    return Math.floor(totalTime / (closedIssues.length * 1000 * 60 * 60 * 24)); // days
  }

  /**
   * Helper method to calculate severity score
   */
  calculateSeverityScore(issues) {
    const weights = {
      open: 1.0,
      closed: 0.2,
      comments_high: 0.8, // >10 comments
      comments_medium: 0.5, // 5-10 comments
      recent: 0.9,
    };

    let totalWeight = 0;
    let maxWeight = 0;

    issues.forEach((issue) => {
      let weight = issue.state === "open" ? weights.open : weights.closed;

      if (issue.comments > 10) weight += weights.comments_high;
      else if (issue.comments > 5) weight += weights.comments_medium;

      if (issue.temporalWeight > 2) weight += weights.recent;

      totalWeight += weight * issue.temporalWeight;
      maxWeight +=
        (weights.open + weights.comments_high + weights.recent) *
        issue.temporalWeight;
    });

    return maxWeight > 0 ? totalWeight / maxWeight : 0;
  }

  /**
   * Generate comprehensive analysis report
   */
  generateReport() {
    console.log("📋 Generating comprehensive analysis report...");

    const report = {
      metadata: {
        analysisDate: new Date().toISOString(),
        totalIssues: this.issues.length,
        analysisVersion: "1.0.0",
        temporalWeighting: this.temporalWeights,
      },
      executiveSummary: this.generateExecutiveSummary(),
      analysis: this.analysis,
      actionPlan: this.generateActionPlan(),
    };

    return report;
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary() {
    const openIssues = this.issues.filter((i) => i.state === "open").length;
    const resolutionRate = (
      ((this.issues.length - openIssues) / this.issues.length) *
      100
    ).toFixed(1);
    const topEnvIssue =
      this.analysis.environmentalCorrelations.criticalCorrelations[0];
    const criticalInsights = this.analysis.predictiveInsights.filter(
      (i) => i.severity === "high"
    ).length;

    return {
      overview: `Analysis of ${this.issues.length} issues reveals ${resolutionRate}% resolution rate with ${openIssues} open issues.`,
      keyFindings: [
        `Primary environmental concern: ${
          topEnvIssue?.factor || "None identified"
        } with ${topEnvIssue?.count || 0} related issues`,
        `${criticalInsights} high-severity predictive insights identified`,
        `Issue trend: ${this.analysis.temporalPatterns.trendAnalysis.trend} (${this.analysis.temporalPatterns.trendAnalysis.changePercent}% change)`,
      ],
      immediateActions: this.analysis.recommendations.filter(
        (r) => r.priority === "high"
      ).length,
      estimatedEffort: this.calculateTotalEffort(),
    };
  }

  /**
   * Generate action plan
   */
  generateActionPlan() {
    return {
      immediate: this.analysis.recommendations.filter(
        (r) => r.priority === "high"
      ),
      shortTerm: this.analysis.recommendations.filter(
        (r) => r.priority === "medium"
      ),
      longTerm: this.analysis.recommendations.filter(
        (r) => r.priority === "low"
      ),
      monitoring: this.analysis.predictiveInsights.map((insight) => ({
        metric: insight.title,
        threshold: insight.confidence,
        action: insight.recommendation,
      })),
    };
  }

  /**
   * Calculate total estimated effort
   */
  calculateTotalEffort() {
    const effortMap = { low: 1, medium: 3, high: 8 };
    return this.analysis.recommendations.reduce((total, rec) => {
      return total + (effortMap[rec.effort] || 3);
    }, 0);
  }

  /**
   * Save analysis results
   */
  saveResults(report) {
    const outputDir = path.join(
      __dirname,
      "../../docs/knowledge-base-generated"
    );
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save full analysis report
    const reportPath = path.join(outputDir, "advanced-analysis-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate markdown summary
    const markdownPath = path.join(outputDir, "advanced-analysis-summary.md");
    const markdown = this.generateMarkdownSummary(report);
    fs.writeFileSync(markdownPath, markdown);

    console.log(`✅ Advanced analysis complete!`);
    console.log(`   Full report: ${reportPath}`);
    console.log(`   Summary: ${markdownPath}`);

    return { reportPath, markdownPath };
  }

  /**
   * Generate markdown summary
   */
  generateMarkdownSummary(report) {
    return `# Advanced Issue Analysis Report

*Generated on ${new Date(report.metadata.analysisDate).toLocaleDateString()}*

## Executive Summary

${report.executiveSummary.overview}

### Key Findings

${report.executiveSummary.keyFindings
  .map((finding) => `- ${finding}`)
  .join("\n")}

### Immediate Actions Required

**${
      report.executiveSummary.immediateActions
    }** high-priority recommendations identified.
**Estimated Effort:** ${report.executiveSummary.estimatedEffort} story points.

## Temporal Pattern Analysis

**Trend:** ${report.analysis.temporalPatterns.trendAnalysis.trend} (${
      report.analysis.temporalPatterns.trendAnalysis.changePercent
    }% change)

Recent activity shows ${report.analysis.temporalPatterns.trendAnalysis.recentAverage.toFixed(
      1
    )} weighted issues per month vs ${report.analysis.temporalPatterns.trendAnalysis.historicalAverage.toFixed(
      1
    )} historically.

## Critical Environmental Correlations

${report.analysis.environmentalCorrelations.criticalCorrelations
  .slice(0, 5)
  .map(
    (env) =>
      `- **${env.factor}**: ${env.count} issues, ${(env.openRate * 100).toFixed(
        1
      )}% open rate, severity ${env.severity.toFixed(2)}`
  )
  .join("\n")}

## Symptom Cascade Analysis

${Object.entries(report.analysis.symptomCascades)
  .map(
    ([cascadeType, cascade]) =>
      `### ${cascadeType.charAt(0).toUpperCase() + cascadeType.slice(1)} Chain
- Severity: ${cascade.severity.toFixed(2)}
- Combinations: ${cascade.combinations.length}
- Individual symptoms: ${Object.keys(cascade.individualSymptoms).length}`
  )
  .join("\n\n")}

## Predictive Insights

${report.analysis.predictiveInsights
  .map(
    (insight) =>
      `### ${insight.title}
**Severity:** ${insight.severity} | **Confidence:** ${(
        insight.confidence * 100
      ).toFixed(1)}%

${insight.description}

> [!${insight.severity === "high" ? "WARNING" : "NOTE"}]
> **Recommendation:** ${insight.recommendation}`
  )
  .join("\n\n")}

## Action Plan

### Immediate Actions (High Priority)

${report.actionPlan.immediate
  .map(
    (action) =>
      `- **${action.title}** (${action.effort} effort, ${action.timeline})
  ${action.description}`
  )
  .join("\n")}

### Short-term Actions (Medium Priority)

${report.actionPlan.shortTerm
  .map(
    (action) =>
      `- **${action.title}** (${action.effort} effort, ${action.timeline})
  ${action.description}`
  )
  .join("\n")}

### Monitoring Recommendations

${report.actionPlan.monitoring
  .map(
    (monitor) =>
      `- **${monitor.metric}**: Monitor threshold ${(
        monitor.threshold * 100
      ).toFixed(1)}%
  Action: ${monitor.action}`
  )
  .join("\n")}

## Community Engagement Analysis

- **Total Contributors:** ${
      report.analysis.communityEngagement.collaborationMetrics.totalContributors
    }
- **Active Contributors:** ${
      report.analysis.communityEngagement.collaborationMetrics
        .activeContributors
    }
- **Engagement Rate:** ${(
      report.analysis.communityEngagement.collaborationMetrics.engagementRate *
      100
    ).toFixed(1)}%

### Top Contributors (by weighted contribution)

${report.analysis.communityEngagement.collaborationMetrics.topContributors
  .slice(0, 5)
  .map(
    (contributor) =>
      `- **@${contributor.login}**: ${contributor.weightedContribution.toFixed(
        1
      )} weighted contributions, ${contributor.issues} issues`
  )
  .join("\n")}

---

*This analysis used temporal weighting with recent issues weighted ${
      report.metadata.temporalWeighting.recent
    }x for enhanced relevance.*

## Methodology

This analysis implements the AI Support Engineer methodology with:

- **Temporal Intelligence**: Recent issues weighted 3x higher than historical data
- **Environmental Correlation Detection**: Cross-referencing issues with system configurations
- **Symptom Cascade Analysis**: Identifying related problem patterns and failure chains
- **Predictive Modeling**: Forward-looking insights based on trend analysis
- **Community Engagement Tracking**: Understanding contributor patterns and collaboration

For detailed methodology, see \`scripts/knowledge-base/advanced-analysis-instructions.md\`.
`;
  }

  /**
   * Run the complete advanced analysis
   */
  async run() {
    console.log("🚀 Starting Advanced Issue Analysis...\n");
    const startTime = Date.now();

    try {
      this.loadIssuesData();
      this.analyzeTemporalPatterns();
      this.analyzeEnvironmentalCorrelations();
      this.analyzeSymptomCascades();
      this.analyzeVersionTransitions();
      this.analyzeCommunityEngagement();
      this.generatePredictiveInsights();
      this.generateRecommendations();

      const report = this.generateReport();
      const paths = this.saveResults(report);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n🎯 Analysis completed in ${duration} seconds`);
      console.log(
        `📊 ${this.analysis.predictiveInsights.length} predictive insights generated`
      );
      console.log(
        `💡 ${this.analysis.recommendations.length} actionable recommendations provided`
      );

      return paths;
    } catch (error) {
      console.error("❌ Analysis failed:", error);
      throw error;
    }
  }
}

// Run analysis if called directly
if (require.main === module) {
  const analyzer = new AdvancedIssueAnalyzer();
  analyzer.run().catch(console.error);
}

module.exports = AdvancedIssueAnalyzer;

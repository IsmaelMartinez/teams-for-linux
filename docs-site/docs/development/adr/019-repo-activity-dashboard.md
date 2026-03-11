---
id: 019-repo-activity-dashboard
---

# ADR 019: Repository Activity Dashboard

## Status

Proposed

## Context

The Teams for Linux project wants to share repository health and activity statistics with its community. Metrics such as issues created/closed per month, PRs merged, commits per month, contributor activity, and release cadence help users and potential contributors understand the project's vitality and trajectory.

Currently, this data is only available through GitHub's built-in Insights tab, which requires navigating to the repository and is not shareable or embeddable. We want a solution that:

- Produces a shareable, visual representation of repo activity
- Can be embedded in the project README or documentation site
- Requires minimal maintenance from a volunteer-maintained project
- Is free for open-source projects
- Covers key metrics: issues, PRs, commits, contributors, and release activity

We evaluated several tools and services that aggregate GitHub repository data into visual dashboards or embeddable widgets.

## Decision

**Use [Repobeats](https://repobeats.axiom.co/) as the primary repo activity visualization**, embedded in the project README.

Repobeats generates a single SVG image that updates automatically and displays contribution analytics including issues, PRs, commits, and top contributors. It requires zero infrastructure, no GitHub Actions minutes, and no ongoing maintenance.

**Implementation:**

1. Sign in at [repobeats.axiom.co](https://repobeats.axiom.co/) with a GitHub account
2. Select the `IsmaelMartinez/teams-for-linux` repository
3. Copy the generated SVG embed snippet
4. Add it to the project README.md (e.g., in a "Project Activity" section)
5. Optionally embed it in the documentation site at `docs-site/docs/development/contributing.md`

**Example embed:**

```markdown
## Project Activity

![Alt](https://repobeats.axiom.co/api/embed/{hash}.svg "Repobeats analytics image")
```

## Consequences

### Positive

- Zero maintenance: Repobeats is a hosted service that updates automatically
- No CI/CD cost: no GitHub Actions minutes consumed
- Instantly shareable: anyone viewing the README sees current activity stats
- Encourages contributions by showing the project is actively maintained
- Simple setup: one-time configuration, single line of markdown

### Negative

- Third-party dependency: relies on Axiom continuing to host the free service
- Limited customization: cannot choose exactly which metrics are displayed
- No historical drill-down: shows a rolling window, not arbitrary date ranges
- SVG only: cannot produce interactive dashboards or detailed breakdowns

### Neutral

- The SVG renders on GitHub, documentation sites, and any markdown viewer
- If Repobeats becomes unavailable, the embed simply shows a broken image with no impact on functionality
- Can be complemented with GitHub's built-in Insights for detailed analysis

## Alternatives Considered

### Option 1: OSS Insight (by PingCAP/TiDB)

[OSS Insight](https://ossinsight.io/) is a comprehensive analytics platform powered by TiDB that analyzes billions of GitHub events. It provides detailed dashboards for any public repository with metrics on stars, forks, issues, PRs, commits, contributors, and more.

- **Shareable output**: Web URL per repository (e.g., `ossinsight.io/analyze/IsmaelMartinez/teams-for-linux`), no embeddable image
- **Free**: Yes, fully free
- **Pros**:
  - Extremely detailed analytics with historical data going back to 2011
  - AI-powered natural language data explorer
  - Repository comparison feature (compare against similar projects)
  - No setup required: works for any public repo out of the box
- **Cons**:
  - Not embeddable in README (link only, no SVG/image widget)
  - External website: users must click through to see data
  - Heavier than needed for a simple activity overview
- **Why rejected**: Cannot be embedded directly in README or docs. The primary goal is to make activity stats visible without requiring users to visit an external site. However, linking to the OSS Insight page in the documentation is recommended as a complementary resource for deeper analysis.

### Option 2: GitHub Actions Custom Workflow (lowlighter/metrics)

The [lowlighter/metrics](https://github.com/lowlighter/metrics) project is a comprehensive infographics generator with 30+ plugins and 300+ options. It runs as a GitHub Action that generates SVG/PNG/markdown output on a schedule and commits it to the repository.

- **Shareable output**: SVG/PNG images committed to the repo, fully embeddable
- **Free**: Yes (uses GitHub Actions minutes)
- **Pros**:
  - Highly customizable: choose exactly which metrics, layout, and style
  - Self-hosted: no third-party dependency
  - Supports 30+ plugins (languages, achievements, activity, stars, etc.)
  - Generates static images that work everywhere
- **Cons**:
  - Requires ongoing maintenance: workflow configuration, plugin updates, breaking changes
  - Consumes GitHub Actions minutes on a schedule (e.g., daily runs)
  - Complex configuration: 300+ options is powerful but increases setup and maintenance burden
  - Commits generated images to the repo, adding noise to git history
- **Why rejected**: Maintenance overhead is too high for a volunteer-maintained project. The configuration complexity and ongoing workflow maintenance outweigh the customization benefits. If Repobeats proves insufficient, this is the strongest fallback option.

### Option 3: GitHub Built-in Insights + Actions Performance Metrics

GitHub provides Insights tabs for every repository (Contributors, Traffic, Commits, Code frequency) and recently made Actions Performance Metrics generally available on all plans.

- **Shareable output**: No embeddable output; only visible on github.com
- **Free**: Yes, built-in
- **Pros**:
  - Zero setup: already available
  - Maintained by GitHub: always up to date
  - Actions Performance Metrics now include queue times, failure rates, and workflow analytics
- **Cons**:
  - Not shareable or embeddable: requires visiting the repo on github.com
  - Limited metrics: no combined dashboard view
  - Cannot be included in README or documentation
  - Contributor graph only shows commit activity, not issues/PRs
- **Why rejected**: Does not meet the primary requirement of shareable, embeddable output. Already available as a complement but does not solve the visibility problem.

### Option 4: CHAOSS / GrimoireLab

[CHAOSS](https://chaoss.community/) defines open-source project health metrics, and [GrimoireLab](https://chaoss.github.io/grimoirelab/) is the toolset that implements them. It provides detailed dashboards via Kibana/OpenSearch.

- **Shareable output**: Self-hosted Kibana dashboards, shareable via URL if publicly deployed
- **Free**: Yes, open source
- **Pros**:
  - Industry-standard metrics (CHAOSS metrics model)
  - Extremely detailed: DEI, community health, contributor onboarding, responsiveness
  - Used by Linux Foundation, CNCF, and other major foundations
- **Cons**:
  - Requires self-hosting: Elasticsearch/OpenSearch + Kibana + GrimoireLab stack
  - Significant infrastructure and maintenance overhead
  - Designed for large foundations with dedicated community managers
  - Overkill for a single-repo project
- **Why rejected**: Infrastructure and maintenance requirements are far beyond what a volunteer-maintained project can sustain. Designed for organizations managing dozens or hundreds of repositories.

## Related

- [Repobeats](https://repobeats.axiom.co/) — chosen tool
- [OSS Insight](https://ossinsight.io/) — recommended as complementary link
- [lowlighter/metrics](https://github.com/lowlighter/metrics) — strongest fallback if Repobeats proves insufficient
- [CHAOSS Project](https://chaoss.community/) — industry-standard metrics definitions

## References

- [GitHub Actions Performance Metrics GA announcement](https://github.blog/changelog/2025-03-14-actions-performance-metrics-are-generally-available-and-enterprise-level-metrics-are-in-public-preview/)
- [Repobeats overview on Open {re}Source](https://openresource.dev/articles/repobeats/)
- [OSSInsight: Scalable GitHub Analysis (VLDB paper)](https://dl.acm.org/doi/10.14778/3685800.3685865)

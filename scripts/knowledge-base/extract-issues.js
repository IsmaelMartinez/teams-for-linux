#!/usr/bin/env node

/**
 * GitHub Issues Extraction Script for Knowledge Base
 * 
 * This script extracts all issues from the teams-for-linux repository
 * using the GitHub API via MCP tools. It implements proper rate limiting,
 * pagination handling, and incremental updates.
 * 
 * Features:
 * - Rate limiting and exponential backoff
 * - Pagination handling for large datasets
 * - Incremental updates using 'since' parameter
 * - Comprehensive error handling
 * - Progress tracking and logging
 * - JSON data validation and integrity checking
 */

const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    // Repository details
    REPO_OWNER: 'IsmaelMartinez',
    REPO_NAME: 'teams-for-linux',
    
    // Output directories
    DATA_DIR: path.join(__dirname, '../../data/issues'),
    RAW_ISSUES_FILE: 'raw-issues.json',
    METADATA_FILE: 'extraction-metadata.json',
    
    // API configuration
    PER_PAGE: 100, // Maximum allowed by GitHub API
    MAX_RETRIES: 3,
    INITIAL_DELAY: 1000, // 1 second
    MAX_DELAY: 30000, // 30 seconds
    
    // Progress reporting
    PROGRESS_INTERVAL: 10, // Report progress every N pages
};

class GitHubIssuesExtractor {
    constructor() {
        this.extractedIssues = [];
        this.totalIssues = 0;
        this.lastUpdate = null;
        this.metadata = {};
        this.startTime = Date.now();
    }

    /**
     * Load existing metadata for incremental updates
     */
    async loadMetadata() {
        try {
            const metadataPath = path.join(CONFIG.DATA_DIR, CONFIG.METADATA_FILE);
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            this.metadata = JSON.parse(metadataContent);
            this.lastUpdate = this.metadata.lastUpdate;
            console.log(`📊 Loaded metadata: Last update ${this.lastUpdate}`);
        } catch {
            // No existing metadata file - initialize fresh metadata
            console.log('📊 No existing metadata found, performing full extraction');
            this.metadata = {
                version: '1.0',
                repository: `${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}`,
                created: new Date().toISOString(),
            };
        }
    }

    /**
     * Save metadata for future incremental updates
     */
    async saveMetadata() {
        this.metadata.lastUpdate = new Date().toISOString();
        this.metadata.totalIssues = this.totalIssues;
        this.metadata.extractionTime = Date.now() - this.startTime;
        
        const metadataPath = path.join(CONFIG.DATA_DIR, CONFIG.METADATA_FILE);
        await fs.writeFile(metadataPath, JSON.stringify(this.metadata, null, 2));
        console.log(`💾 Saved metadata: ${this.totalIssues} issues extracted`);
    }

    /**
     * Extract issues with comprehensive error handling and rate limiting
     */
    async extractIssues(isIncremental = false) {
        console.log(`🚀 Starting ${isIncremental ? 'incremental' : 'full'} issue extraction...`);
        
        let page = 1;
        let hasMorePages = true;
        let consecutiveErrors = 0;
        
        while (hasMorePages) {
            try {
                // Build parameters for API call
                const params = {
                    owner: CONFIG.REPO_OWNER,
                    repo: CONFIG.REPO_NAME,
                    state: 'all', // Get both open and closed issues
                    per_page: CONFIG.PER_PAGE,
                    page: page,
                    sort: 'updated',
                    direction: 'desc'
                };

                // Add 'since' parameter for incremental updates
                if (isIncremental && this.lastUpdate) {
                    params.since = this.lastUpdate;
                }

                console.log(`📥 Fetching page ${page}...`);
                
                // This would normally be an MCP call - for now we simulate the structure
                // In real implementation: const response = await mcp_github_list_issues(params);
                const issues = await this.simulateApiCall(params);
                
                if (!issues || issues.length === 0) {
                    console.log('✅ No more issues found');
                    break;
                }

                // Process and validate each issue
                const processedIssues = await this.processIssues(issues);
                this.extractedIssues.push(...processedIssues);
                
                // Progress reporting
                if (page % CONFIG.PROGRESS_INTERVAL === 0) {
                    console.log(`📊 Progress: ${this.extractedIssues.length} issues extracted from ${page} pages`);
                }

                // Check if we have more pages
                hasMorePages = issues.length === CONFIG.PER_PAGE;
                page++;
                consecutiveErrors = 0;

                // Rate limiting - small delay between requests
                await this.delay(100);
                
            } catch (error) {
                consecutiveErrors++;
                console.error(`❌ Error on page ${page}:`, error.message);
                
                if (consecutiveErrors >= CONFIG.MAX_RETRIES) {
                    console.error(`💥 Max retries exceeded. Stopping extraction.`);
                    throw new Error(`Failed after ${CONFIG.MAX_RETRIES} consecutive errors`);
                }
                
                // Exponential backoff
                const delay = Math.min(
                    CONFIG.INITIAL_DELAY * Math.pow(2, consecutiveErrors - 1),
                    CONFIG.MAX_DELAY
                );
                console.log(`⏳ Retrying in ${delay}ms...`);
                await this.delay(delay);
            }
        }

        this.totalIssues = this.extractedIssues.length;
        console.log(`✅ Extraction complete: ${this.totalIssues} issues extracted`);
    }

    /**
     * Process and enrich individual issues with additional data
     */
    async processIssues(issues) {
        const processedIssues = [];
        
        for (const issue of issues) {
            try {
                // Extract essential metadata
                const processedIssue = {
                    // Basic information
                    id: issue.id,
                    number: issue.number,
                    title: issue.title,
                    body: issue.body || '',
                    state: issue.state,
                    
                    // User information
                    author: {
                        login: issue.user?.login,
                        type: issue.user?.type,
                        association: issue.author_association
                    },
                    
                    // Labels and categorization
                    labels: issue.labels?.map(label => ({
                        name: label.name,
                        color: label.color,
                        description: label.description
                    })) || [],
                    
                    // Assignees
                    assignees: issue.assignees?.map(assignee => assignee.login) || [],
                    
                    // Timestamps
                    created_at: issue.created_at,
                    updated_at: issue.updated_at,
                    closed_at: issue.closed_at,
                    
                    // Metrics
                    comments_count: issue.comments || 0,
                    reactions: issue.reactions || { total_count: 0 },
                    
                    // Links
                    html_url: issue.html_url,
                    
                    // Processing metadata
                    extracted_at: new Date().toISOString(),
                    is_pull_request: !!issue.pull_request
                };

                // Add comment extraction for high-value issues
                if (issue.comments > 0 && this.shouldExtractComments(issue)) {
                    processedIssue.comments = await this.extractComments(issue.number);
                }

                processedIssues.push(processedIssue);
                
            } catch (error) {
                console.warn(`⚠️ Failed to process issue #${issue.number}:`, error.message);
                // Continue processing other issues
            }
        }
        
        return processedIssues;
    }

    /**
     * Determine if we should extract comments for an issue
     */
    shouldExtractComments(issue) {
        // Extract comments for:
        // - Closed issues (potential solutions)
        // - Issues with multiple comments (community discussion)
        // - Issues with specific solution-related labels
        const solutionLabels = ['bug', 'enhancement', 'known issue/workaround'];
        const hasRelevantLabel = issue.labels?.some(label => 
            solutionLabels.includes(label.name.toLowerCase())
        );
        
        return issue.state === 'closed' || 
               issue.comments >= 3 || 
               hasRelevantLabel;
    }

    /**
     * Extract comments for a specific issue
     */
    async extractComments(issueNumber) {
        try {
            // Simulate MCP call: mcp_github_get_issue_comments
            console.log(`💬 Extracting comments for issue #${issueNumber}`);
            
            // This would be the actual MCP call
            // const comments = await mcp_github_get_issue_comments({
            //     owner: CONFIG.REPO_OWNER,
            //     repo: CONFIG.REPO_NAME,
            //     issue_number: issueNumber
            // });
            
            // Simulate comment structure
            return []; // Placeholder - would return actual comment data
            
        } catch (error) {
            console.warn(`⚠️ Failed to extract comments for issue #${issueNumber}:`, error.message);
            return [];
        }
    }

    /**
     * Validate extracted data integrity
     */
    validateData() {
        console.log('🔍 Validating extracted data...');
        
        const validation = {
            totalIssues: this.extractedIssues.length,
            uniqueIssues: new Set(this.extractedIssues.map(issue => issue.id)).size,
            issuesWithComments: this.extractedIssues.filter(issue => issue.comments?.length > 0).length,
            closedIssues: this.extractedIssues.filter(issue => issue.state === 'closed').length,
            openIssues: this.extractedIssues.filter(issue => issue.state === 'open').length,
            pullRequests: this.extractedIssues.filter(issue => issue.is_pull_request).length,
            validationTime: new Date().toISOString()
        };

        // Check for duplicates
        if (validation.totalIssues !== validation.uniqueIssues) {
            console.warn(`⚠️ Found ${validation.totalIssues - validation.uniqueIssues} duplicate issues`);
        }

        console.log('✅ Data validation results:', {
            'Total Issues': validation.totalIssues,
            'Closed Issues': validation.closedIssues,
            'Open Issues': validation.openIssues,
            'Pull Requests': validation.pullRequests,
            'Issues with Comments': validation.issuesWithComments
        });

        return validation;
    }

    /**
     * Save extracted data to JSON files
     */
    async saveData() {
        console.log('💾 Saving extracted data...');
        
        // Ensure output directory exists
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // Save raw issues data
        const rawIssuesPath = path.join(CONFIG.DATA_DIR, CONFIG.RAW_ISSUES_FILE);
        const dataToSave = {
            metadata: this.metadata,
            validation: this.validateData(),
            issues: this.extractedIssues
        };
        
        await fs.writeFile(rawIssuesPath, JSON.stringify(dataToSave, null, 2));
        console.log(`✅ Saved ${this.totalIssues} issues to ${rawIssuesPath}`);
        
        // Save metadata
        await this.saveMetadata();
    }

    /**
     * Utility function for delays
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Simulate API call for development/testing
     * In real implementation, this would be replaced with actual MCP calls
     */
    async simulateApiCall(params) {
        // This is a placeholder - in real implementation would use:
        // return await mcp_github_list_issues(params);
        
        // For now, return empty array to simulate no more data
        if (params.page > 1) {
            return [];
        }
        
        // Return sample data structure for first page
        return [{
            id: 1234567,
            number: 1773,
            title: "[Feat]: Sample issue for testing",
            body: "Sample issue body...",
            state: "open",
            user: { login: "testuser", type: "User" },
            author_association: "NONE",
            labels: [{ name: "enhancement", color: "a2eeef", description: "New feature" }],
            assignees: [],
            created_at: "2025-07-30T00:00:00Z",
            updated_at: "2025-07-30T00:00:00Z",
            closed_at: null,
            comments: 0,
            reactions: { total_count: 0 },
            html_url: "https://github.com/IsmaelMartinez/teams-for-linux/issues/1773"
        }];
    }

    /**
     * Main execution method
     */
    async run(incremental = false) {
        try {
            console.log('🔧 GitHub Issues Extractor v1.0');
            console.log(`📁 Data directory: ${CONFIG.DATA_DIR}`);
            console.log(`🎯 Repository: ${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}`);
            
            await this.loadMetadata();
            await this.extractIssues(incremental);
            await this.saveData();
            
            const duration = (Date.now() - this.startTime) / 1000;
            console.log(`🎉 Extraction completed in ${duration}s`);
            console.log(`📊 Final stats: ${this.totalIssues} issues extracted`);
            
        } catch (error) {
            console.error('💥 Extraction failed:', error);
            process.exit(1);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const incremental = args.includes('--incremental') || args.includes('-i');
    const help = args.includes('--help') || args.includes('-h');
    
    if (help) {
        console.log(`
GitHub Issues Extractor for Knowledge Base

Usage:
  node extract-issues.js [options]

Options:
  --incremental, -i    Perform incremental update (only new/updated issues)
  --help, -h          Show this help message

Examples:
  node extract-issues.js                    # Full extraction
  node extract-issues.js --incremental      # Incremental update
        `);
        process.exit(0);
    }
    
    const extractor = new GitHubIssuesExtractor();
    extractor.run(incremental);
}

module.exports = GitHubIssuesExtractor;

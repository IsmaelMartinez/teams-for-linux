#!/usr/bin/env node

/**
 * Test script to validate MCP integration for GitHub Issues extraction
 * 
 * This script demonstrates how the extraction would work when run in 
 * VS Code environment with MCP tools available.
 */

/* global mcp_github_list_issues, mcp_github_get_issue_comments */

// Import the extractor
const GitHubIssuesExtractor = require('./extract-issues');

async function testMCPIntegration() {
    console.log('🧪 Testing MCP Integration...');
    
    // Test 1: Verify script works in simulation mode
    console.log('\n📋 Test 1: Simulation Mode');
    const extractor = new GitHubIssuesExtractor();
    
    try {
        await extractor.run(false); // Full extraction in simulation
        console.log('✅ Simulation mode test passed');
    } catch (error) {
        console.error('❌ Simulation mode test failed:', error);
        return false;
    }
    
    // Test 2: Check MCP detection logic
    console.log('\n📋 Test 2: MCP Detection');
    const hasListIssues = typeof mcp_github_list_issues !== 'undefined';
    const hasGetComments = typeof mcp_github_get_issue_comments !== 'undefined';
    
    console.log(`🔍 mcp_github_list_issues available: ${hasListIssues}`);
    console.log(`🔍 mcp_github_get_issue_comments available: ${hasGetComments}`);
    
    if (hasListIssues && hasGetComments) {
        console.log('✅ MCP tools detected - ready for real API calls');
        
        // Test 3: Real MCP call (if available)
        console.log('\n📋 Test 3: Real MCP API Call');
        try {
            const testParams = {
                owner: 'IsmaelMartinez',
                repo: 'teams-for-linux',
                state: 'all',
                per_page: 5, // Small test batch
                page: 1,
                sort: 'updated',
                direction: 'desc'
            };
            
            console.log('🔗 Making test MCP call...');
            const issues = await mcp_github_list_issues(testParams);
            
            console.log(`✅ MCP call successful: Retrieved ${issues.length} issues`);
            if (issues.length > 0) {
                console.log(`📊 Sample issue: #${issues[0].number} - ${issues[0].title}`);
            }
            
        } catch (error) {
            console.error('❌ MCP call failed:', error);
            return false;
        }
        
    } else {
        console.log('ℹ️ MCP tools not available - would use simulation mode');
    }
    
    console.log('\n🎉 All tests completed successfully!');
    return true;
}

// CLI interface
if (require.main === module) {
    testMCPIntegration()
        .then(success => {
            if (success) {
                console.log('\n✅ MCP Integration test suite passed');
                process.exit(0);
            } else {
                console.log('\n❌ MCP Integration test suite failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n💥 Test suite crashed:', error);
            process.exit(1);
        });
}

module.exports = { testMCPIntegration };

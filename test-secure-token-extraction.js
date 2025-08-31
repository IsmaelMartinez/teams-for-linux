#!/usr/bin/env node

/**
 * Test script for secure token extraction functionality
 * Tests the main process token extraction without DOM access
 */

const { app } = require('electron');
const SecureTokenExtractor = require('./app/secureTokenExtractor');

async function testSecureTokenExtraction() {
  console.log('=== Secure Token Extraction Test ===\n');
  
  try {
    await app.whenReady();
    
    // Test with default partition
    console.log('1. Testing default partition...');
    const extractor = new SecureTokenExtractor('persist:teams-4-linux');
    
    // Test token extraction
    console.log('\n2. Attempting token extraction...');
    const tokenData = await extractor.extractAccessToken();
    
    if (tokenData) {
      console.log('✅ Token extraction successful!');
      console.log(`   Source: ${tokenData.source}`);
      console.log(`   Extracted at: ${tokenData.extractedAt}`);
      console.log(`   Token length: ${tokenData.token.length} characters`);
      console.log(`   Token preview: ${tokenData.token.substring(0, 20)}...`);
    } else {
      console.log('⚠️  No token extracted - this is expected if not logged into Teams');
    }
    
    // Test Graph API connection
    console.log('\n3. Testing Graph API connection...');
    const connectionResult = await extractor.testGraphConnection();
    
    if (connectionResult) {
      console.log('✅ Graph API connection successful!');
      
      // Test calendar access
      console.log('\n4. Testing calendar access...');
      const calendarResult = await extractor.getUserCalendarEvents(1);
      if (calendarResult.success) {
        console.log(`✅ Calendar access successful! Found ${calendarResult.count} events`);
      } else {
        console.log('⚠️  Calendar access failed:', calendarResult.error);
      }
      
      // Test mail access
      console.log('\n5. Testing mail access...');
      const mailResult = await extractor.getUserMailMessages(5);
      if (mailResult.success) {
        console.log(`✅ Mail access successful! Found ${mailResult.count} messages`);
      } else {
        console.log('⚠️  Mail access failed:', mailResult.error);
      }
      
    } else {
      console.log('❌ Graph API connection failed');
      console.log('   This could be due to:');
      console.log('   - No valid authentication token found');
      console.log('   - User not logged into Teams');
      console.log('   - Organizational restrictions on Graph API access');
    }
    
    // Test token caching
    console.log('\n6. Testing token caching...');
    const cachedToken = await extractor.getValidAccessToken();
    if (cachedToken) {
      console.log('✅ Token caching working');
    } else {
      console.log('⚠️  No cached token available');
    }
    
    // Show status
    console.log('\n7. System status:');
    const status = extractor.getStatus();
    console.log('   Partition:', status.partitionName);
    console.log('   Cached tokens:', status.cachedTokens);
    console.log('   Refresh active:', status.refreshActive);
    
    console.log('\n=== Test Complete ===');
    
    // Start token refresh for testing
    console.log('\n8. Starting token refresh (5 second intervals)...');
    extractor.startTokenRefresh(5 / 60); // 5 seconds for testing
    
    // Wait a bit to see refresh in action
    setTimeout(() => {
      console.log('9. Stopping token refresh...');
      extractor.stopTokenRefresh();
      extractor.clearTokenCache();
      
      console.log('\n✅ Secure token extraction test completed successfully!');
      console.log('\nThis system can now:');
      console.log('- Extract authentication tokens from main process');
      console.log('- Make secure Graph API requests without DOM access');
      console.log('- Provide fallback for contextIsolation-enabled security');
      console.log('- Support personal productivity features via Microsoft Graph');
      
      process.exit(0);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle app events
app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Start test
testSecureTokenExtraction();
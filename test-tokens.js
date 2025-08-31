#!/usr/bin/env node

/**
 * Simple test to analyze stored tokens without running full Teams app
 */
const { app, session } = require('electron');
const TokenInspector = require('./app/tokenInspector');

async function testStoredTokens() {
  console.log('=== Token Storage Analysis ===');
  
  try {
    await app.whenReady();
    
    // Test different partition configurations
    const partitions = [
      'persist:teams-4-linux',
      'teams-4-linux', 
      'persist:teams-for-linux',
      'teams-for-linux'
    ];

    for (const partition of partitions) {
      console.log(`\n--- Testing partition: ${partition} ---`);
      
      try {
        const inspector = new TokenInspector(partition);
        
        // Check cookies
        const cookies = await inspector.getMicrosoftCookies();
        console.log('Cookies found:', {
          microsoft: cookies?.microsoft?.length || 0,
          teams: cookies?.teams?.length || 0,
          live: cookies?.live?.length || 0
        });
        
        // Show some cookie names (without values for security)
        if (cookies?.microsoft?.length > 0) {
          console.log('Microsoft cookie names:', 
            cookies.microsoft.slice(0, 3).map(c => c.name).join(', ') + 
            (cookies.microsoft.length > 3 ? '...' : '')
          );
        }
        
        if (cookies?.teams?.length > 0) {
          console.log('Teams cookie names:', 
            cookies.teams.slice(0, 3).map(c => c.name).join(', ') + 
            (cookies.teams.length > 3 ? '...' : '')
          );
        }
        
        // Check storage
        const storage = await inspector.getLocalStorageData();
        if (storage) {
          console.log('LocalStorage files:', storage.files?.length || 0);
          console.log('Storage path:', storage.path);
        } else {
          console.log('LocalStorage: Not accessible');
        }
        
      } catch (error) {
        console.error(`Error with partition ${partition}:`, error.message);
      }
    }
    
    console.log('\n=== Test Complete ===');
    app.quit();
    
  } catch (error) {
    console.error('Test failed:', error);
    app.quit();
    process.exit(1);
  }
}

// Handle Electron app lifecycle
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('ready', () => {
  // Don't create any windows, just run the test
  testStoredTokens();
});

// Start the test
testStoredTokens().catch(error => {
  console.error('Failed to start test:', error);
  process.exit(1);
});
const { session } = require('electron');
const fs = require('fs').promises;
const path = require('path');

/**
 * Token Inspector - Analyzes stored tokens and session data
 * to determine if we can access Graph API from the main process
 */
class TokenInspector {

  constructor(partitionName = 'persist:teams-4-linux') {
    this.partitionName = partitionName;
    this.session = session.fromPartition(partitionName);
  }

  /**
   * Extract all cookies for Microsoft domains
   */
  async getMicrosoftCookies() {
    try {
      const cookies = await this.session.cookies.get({
        domain: '.microsoft.com'
      });
      
      const teamsCookies = await this.session.cookies.get({
        domain: '.teams.microsoft.com'
      });

      const liveCookies = await this.session.cookies.get({
        domain: '.live.com'
      });

      return {
        microsoft: cookies,
        teams: teamsCookies,
        live: liveCookies
      };
    } catch (error) {
      console.error('TokenInspector: Error getting cookies:', error);
      return null;
    }
  }

  /**
   * Check localStorage for potential tokens
   */
  async getLocalStorageData() {
    try {
      // Get the partition's data path
      const partitionPath = this.session.getStoragePath();
      if (!partitionPath) {
        console.warn('TokenInspector: No storage path available');
        return null;
      }

      console.debug('TokenInspector: Storage path:', partitionPath);
      
      // Look for localStorage data files
      const localStoragePath = path.join(partitionPath, 'Local Storage', 'leveldb');
      
      try {
        const files = await fs.readdir(localStoragePath);
        console.debug('TokenInspector: LocalStorage files:', files);
        return { files, path: localStoragePath };
      } catch (error) {
        console.debug('TokenInspector: LocalStorage directory not accessible:', error.message);
        return null;
      }

    } catch (error) {
      console.error('TokenInspector: Error accessing localStorage:', error);
      return null;
    }
  }

  /**
   * Execute JavaScript in the main window to extract tokens
   */
  async extractTokensFromRenderer(webContents) {
    try {
      const result = await webContents.executeJavaScript(`
        (async () => {
          const results = {
            localStorage: {},
            sessionStorage: {},
            indexedDBKeys: [],
            documentCookies: document.cookie,
            hasTeamsAuth: false
          };

          // Check localStorage
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.includes('token') || key.includes('auth') || key.includes('microsoft') || key.includes('msal'))) {
                results.localStorage[key] = localStorage.getItem(key);
              }
            }
          } catch (e) {
            results.localStorageError = e.message;
          }

          // Check sessionStorage
          try {
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && (key.includes('token') || key.includes('auth') || key.includes('microsoft') || key.includes('msal'))) {
                results.sessionStorage[key] = sessionStorage.getItem(key);
              }
            }
          } catch (e) {
            results.sessionStorageError = e.message;
          }

          // Check IndexedDB databases
          try {
            if (window.indexedDB) {
              const databases = await indexedDB.databases();
              results.indexedDBKeys = databases.map(db => db.name);
            }
          } catch (e) {
            results.indexedDBError = e.message;
          }

          // Check if we can access Teams auth from window
          try {
            if (window.location.hostname.includes('teams.microsoft.com')) {
              const appElement = document.getElementById('app');
              if (appElement && appElement._reactRootContainer) {
                results.hasTeamsAuth = true;
                results.teamsAuthAvailable = 'React container found';
              }
            }
          } catch (e) {
            results.teamsAuthError = e.message;
          }

          return results;
        })()
      `);

      return result;
    } catch (error) {
      console.error('TokenInspector: Error extracting tokens from renderer:', error);
      return null;
    }
  }

  /**
   * Try to make a Graph API request using extracted tokens
   */
  async testGraphApiWithStoredTokens(accessToken) {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: await response.text()
        };
      }

      const userData = await response.json();
      return {
        success: true,
        data: {
          id: userData.id,
          displayName: userData.displayName,
          userPrincipalName: userData.userPrincipalName,
          mail: userData.mail
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Comprehensive token analysis
   */
  async analyzeStoredTokens(webContents) {
    console.log('TokenInspector: Starting comprehensive token analysis...');
    
    const analysis = {
      timestamp: new Date().toISOString(),
      partition: this.partitionName,
      cookies: null,
      localStorage: null,
      rendererTokens: null,
      storageInfo: null
    };

    // Get cookies
    analysis.cookies = await this.getMicrosoftCookies();
    console.log('TokenInspector: Found cookies:', {
      microsoft: analysis.cookies?.microsoft?.length || 0,
      teams: analysis.cookies?.teams?.length || 0,
      live: analysis.cookies?.live?.length || 0
    });

    // Get storage info
    analysis.storageInfo = await this.getLocalStorageData();

    // Get renderer-side tokens
    if (webContents) {
      analysis.rendererTokens = await this.extractTokensFromRenderer(webContents);
      console.log('TokenInspector: Renderer analysis:', {
        localStorageKeys: Object.keys(analysis.rendererTokens?.localStorage || {}),
        sessionStorageKeys: Object.keys(analysis.rendererTokens?.sessionStorage || {}),
        indexedDBs: analysis.rendererTokens?.indexedDBKeys || [],
        hasTeamsAuth: analysis.rendererTokens?.hasTeamsAuth
      });
    }

    return analysis;
  }
}

module.exports = TokenInspector;
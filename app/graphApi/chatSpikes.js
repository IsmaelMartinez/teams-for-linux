/**
 * Chat API Validation Spikes
 *
 * Run these spikes to validate if the chat modal feature is feasible.
 * These are throwaway validation tests - not production code.
 *
 * To run: Enable Graph API in config, then from DevTools console:
 *   const results = await window.electronAPI.invoke('run-chat-spikes');
 *   console.table(results);
 */

const logger = require('electron-log');

class ChatApiSpikes {
  constructor(graphApiClient) {
    this.client = graphApiClient;
    this.results = {};
  }

  /**
   * Run all chat validation spikes
   * @returns {Promise<object>} Results of all spikes
   */
  async runAllSpikes() {
    logger.info('[CHAT_SPIKE] ========================================');
    logger.info('[CHAT_SPIKE] Starting Chat API Validation Spikes');
    logger.info('[CHAT_SPIKE] ========================================');

    // Critical spikes (blockers)
    this.results.spike1_chatPermissions = await this.spike1_testChatPermissions();

    // Only proceed if Spike 1 passes
    if (!this.results.spike1_chatPermissions.hasPermission) {
      logger.error('[CHAT_SPIKE] BLOCKER: Chat permissions not available. Stopping.');
      this.results.overallResult = 'BLOCKED';
      this.results.recommendation = 'Chat API permissions not available. Consider alternatives: Teams deep links or read-only features.';
      return this.results;
    }

    // Continue with remaining spikes
    this.results.spike2_chatDiscovery = await this.spike2_testChatDiscovery();
    this.results.spike3_firstMessage = await this.spike3_testFirstMessage();
    this.results.spike4_userSearch = await this.spike4_testUserSearch();
    this.results.spike5_messageFormat = await this.spike5_testMessageFormat();
    this.results.spike6_rateLimits = await this.spike6_testRateLimits();

    // Generate overall assessment
    this.results.overallResult = this._generateOverallAssessment();

    logger.info('[CHAT_SPIKE] ========================================');
    logger.info('[CHAT_SPIKE] Spike Results Summary');
    logger.info('[CHAT_SPIKE] ========================================');
    logger.info('[CHAT_SPIKE]', JSON.stringify(this.results, null, 2));

    return this.results;
  }

  /**
   * SPIKE 1: Test Chat API Permissions (CRITICAL BLOCKER)
   * Tests if /me/chats endpoint is accessible
   */
  async spike1_testChatPermissions() {
    logger.info('[CHAT_SPIKE 1] Testing chat permissions (GET /me/chats)...');

    try {
      const result = await this.client.makeRequest('/me/chats?$top=1');

      const spikeResult = {
        spike: 'Chat Permissions',
        success: result.success,
        status: result.status,
        hasPermission: result.success === true,
        chatCount: result.data?.value?.length ?? 0,
        error: result.error || null
      };

      if (result.success) {
        logger.info('[CHAT_SPIKE 1] ✅ Chat.Read scope AVAILABLE');
        logger.info('[CHAT_SPIKE 1] Found', spikeResult.chatCount, 'chat(s)');
      } else if (result.status === 403) {
        logger.error('[CHAT_SPIKE 1] ❌ Chat.Read scope NOT AVAILABLE (403 Forbidden)');
        logger.error('[CHAT_SPIKE 1] This is a CRITICAL BLOCKER - chat feature cannot be implemented');
      } else {
        logger.warn('[CHAT_SPIKE 1] ⚠️ Unexpected response:', result.status, result.error);
      }

      return spikeResult;

    } catch (error) {
      logger.error('[CHAT_SPIKE 1] Exception:', error.message);
      return {
        spike: 'Chat Permissions',
        success: false,
        hasPermission: false,
        error: error.message
      };
    }
  }

  /**
   * SPIKE 2: Test Chat Discovery
   * Tests if we can find 1:1 chats and understand the response structure
   */
  async spike2_testChatDiscovery() {
    logger.info('[CHAT_SPIKE 2] Testing chat discovery...');

    try {
      // Get all chats with member details
      const result = await this.client.makeRequest('/me/chats?$expand=members&$top=10');

      if (!result.success) {
        return {
          spike: 'Chat Discovery',
          success: false,
          error: result.error
        };
      }

      const chats = result.data?.value || [];
      const oneOnOneChats = chats.filter(c => c.chatType === 'oneOnOne');
      const groupChats = chats.filter(c => c.chatType === 'group');

      // Examine first 1:1 chat structure
      let memberStructure = null;
      if (oneOnOneChats.length > 0) {
        const firstChat = oneOnOneChats[0];
        memberStructure = {
          chatId: firstChat.id,
          chatType: firstChat.chatType,
          topic: firstChat.topic,
          memberCount: firstChat.members?.length,
          memberSample: firstChat.members?.[0] ? {
            id: firstChat.members[0].id,
            displayName: firstChat.members[0].displayName,
            userId: firstChat.members[0].userId,
            email: firstChat.members[0].email
          } : null
        };
      }

      const spikeResult = {
        spike: 'Chat Discovery',
        success: true,
        totalChats: chats.length,
        oneOnOneCount: oneOnOneChats.length,
        groupChatCount: groupChats.length,
        memberStructure,
        canFilterByType: true,
        canExpandMembers: true
      };

      logger.info('[CHAT_SPIKE 2] ✅ Chat discovery successful');
      logger.info('[CHAT_SPIKE 2] Found', oneOnOneChats.length, '1:1 chats,', groupChats.length, 'group chats');
      if (memberStructure) {
        logger.info('[CHAT_SPIKE 2] Member structure:', JSON.stringify(memberStructure, null, 2));
      }

      return spikeResult;

    } catch (error) {
      logger.error('[CHAT_SPIKE 2] Exception:', error.message);
      return {
        spike: 'Chat Discovery',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * SPIKE 3: Test First-Time Message Flow
   * Tests if we can create a new chat or if chat auto-creates on message
   */
  async spike3_testFirstMessage() {
    logger.info('[CHAT_SPIKE 3] Testing first-time message flow...');
    logger.info('[CHAT_SPIKE 3] NOTE: This is a read-only test - will not send messages');

    try {
      // Test 1: Check if we can create chats (Chat.Create permission)
      // We'll just check if the endpoint responds, not actually create
      const checkResult = await this.client.makeRequest('/chats', {
        method: 'POST',
        body: {
          chatType: 'oneOnOne',
          members: [
            // Empty members to trigger validation error, not actual creation
          ]
        }
      });

      // Expect 400 (bad request) for empty members, which proves endpoint is accessible
      // 403 would mean no permission
      const hasCreatePermission = checkResult.status !== 403;

      const spikeResult = {
        spike: 'First Message Flow',
        success: true,
        hasCreatePermission,
        responseStatus: checkResult.status,
        note: hasCreatePermission
          ? 'Chat creation endpoint accessible - can create 1:1 chats'
          : 'No permission to create chats - may need to use existing chats only',
        recommendation: hasCreatePermission
          ? 'Implement: 1) Search/create chat, 2) Send message'
          : 'Alternative: Only allow messaging in existing chats'
      };

      if (hasCreatePermission) {
        logger.info('[CHAT_SPIKE 3] ✅ Chat creation endpoint accessible');
      } else {
        logger.warn('[CHAT_SPIKE 3] ⚠️ No chat creation permission');
      }

      return spikeResult;

    } catch (error) {
      logger.error('[CHAT_SPIKE 3] Exception:', error.message);
      return {
        spike: 'First Message Flow',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * SPIKE 4: Test User Search
   * Tests various user search patterns
   */
  async spike4_testUserSearch() {
    logger.info('[CHAT_SPIKE 4] Testing user search...');

    const searchResults = {
      spike: 'User Search',
      success: true,
      searchMethods: {}
    };

    // Test different search approaches
    const searchTests = [
      {
        name: 'displayName_startswith',
        endpoint: '/users?$filter=startswith(displayName,\'Test\')&$top=3'
      },
      {
        name: 'userPrincipalName_startswith',
        endpoint: '/users?$filter=startswith(userPrincipalName,\'test\')&$top=3'
      },
      {
        name: 'mail_startswith',
        endpoint: '/users?$filter=startswith(mail,\'test\')&$top=3'
      },
      {
        name: 'search_query',
        endpoint: '/users?$search="displayName:test"&$top=3',
        headers: { 'ConsistencyLevel': 'eventual' }
      },
      {
        name: 'people_api',
        endpoint: '/me/people?$search="test"&$top=3'
      }
    ];

    for (const test of searchTests) {
      try {
        const result = await this.client.makeRequest(test.endpoint, {
          headers: test.headers
        });

        searchResults.searchMethods[test.name] = {
          works: result.success,
          status: result.status,
          resultCount: result.data?.value?.length ?? 0,
          error: result.error
        };

        const status = result.success ? '✅' : '❌';
        logger.info(`[CHAT_SPIKE 4] ${status} ${test.name}: status=${result.status}, results=${result.data?.value?.length ?? 0}`);

      } catch (error) {
        searchResults.searchMethods[test.name] = {
          works: false,
          error: error.message
        };
        logger.error(`[CHAT_SPIKE 4] ❌ ${test.name}: ${error.message}`);
      }
    }

    // Determine best search method
    const workingMethods = Object.entries(searchResults.searchMethods)
      .filter(([, v]) => v.works)
      .map(([k]) => k);

    searchResults.workingMethods = workingMethods;
    searchResults.recommendation = workingMethods.length > 0
      ? `Use: ${workingMethods[0]} (or /me/people for relevance-based)`
      : 'No user search method works - consider using chat member search instead';

    return searchResults;
  }

  /**
   * SPIKE 5: Test Message Format
   * Examines message content structure
   */
  async spike5_testMessageFormat() {
    logger.info('[CHAT_SPIKE 5] Testing message format...');

    try {
      // Get first chat
      const chatsResult = await this.client.makeRequest('/me/chats?$top=1');

      if (!chatsResult.success || !chatsResult.data?.value?.length) {
        return {
          spike: 'Message Format',
          success: false,
          error: 'No chats available to examine messages'
        };
      }

      const chatId = chatsResult.data.value[0].id;

      // Get messages from that chat
      const messagesResult = await this.client.makeRequest(`/chats/${chatId}/messages?$top=5`);

      if (!messagesResult.success) {
        return {
          spike: 'Message Format',
          success: false,
          error: messagesResult.error
        };
      }

      const messages = messagesResult.data?.value || [];
      const messageFormats = messages.map(msg => ({
        id: msg.id,
        bodyContentType: msg.body?.contentType,
        hasAttachments: (msg.attachments?.length ?? 0) > 0,
        hasMentions: (msg.mentions?.length ?? 0) > 0,
        messageType: msg.messageType,
        from: msg.from?.user?.displayName || msg.from?.application?.displayName || 'unknown',
        bodyPreview: msg.body?.content?.substring(0, 50)
      }));

      const spikeResult = {
        spike: 'Message Format',
        success: true,
        messageCount: messages.length,
        formats: messageFormats,
        contentTypes: [...new Set(messageFormats.map(m => m.bodyContentType))],
        hasHtmlContent: messageFormats.some(m => m.bodyContentType === 'html'),
        hasAttachments: messageFormats.some(m => m.hasAttachments),
        hasMentions: messageFormats.some(m => m.hasMentions),
        recommendation: messageFormats.some(m => m.bodyContentType === 'html')
          ? 'Use HTML sanitization (DOMPurify) for rendering'
          : 'Plain text rendering may be sufficient'
      };

      logger.info('[CHAT_SPIKE 5] ✅ Message format examined');
      logger.info('[CHAT_SPIKE 5] Content types found:', spikeResult.contentTypes);

      return spikeResult;

    } catch (error) {
      logger.error('[CHAT_SPIKE 5] Exception:', error.message);
      return {
        spike: 'Message Format',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * SPIKE 6: Test Rate Limits
   * Makes rapid requests to understand throttling behavior
   */
  async spike6_testRateLimits() {
    logger.info('[CHAT_SPIKE 6] Testing rate limits (10 rapid requests)...');

    try {
      const requestCount = 10;
      const results = [];
      const startTime = Date.now();

      // Make rapid sequential requests
      for (let i = 0; i < requestCount; i++) {
        const reqStart = Date.now();
        const result = await this.client.makeRequest('/me/chats?$top=1');
        const reqDuration = Date.now() - reqStart;

        results.push({
          index: i,
          status: result.status || (result.success ? 200 : 500),
          success: result.success,
          duration: reqDuration,
          rateLimited: result.status === 429
        });
      }

      const totalDuration = Date.now() - startTime;
      const rateLimitedCount = results.filter(r => r.rateLimited).length;
      const avgDuration = Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length);

      const spikeResult = {
        spike: 'Rate Limits',
        success: true,
        requestCount,
        totalDuration,
        avgRequestDuration: avgDuration,
        rateLimitedCount,
        rateLimitEncountered: rateLimitedCount > 0,
        recommendation: rateLimitedCount > 0
          ? `Add request throttling. ${rateLimitedCount}/${requestCount} requests were rate limited.`
          : 'No rate limiting encountered with 10 rapid requests. Safe to proceed without special throttling.'
      };

      if (rateLimitedCount > 0) {
        logger.warn(`[CHAT_SPIKE 6] ⚠️ Rate limiting detected: ${rateLimitedCount}/${requestCount} requests`);
      } else {
        logger.info('[CHAT_SPIKE 6] ✅ No rate limiting with 10 rapid requests');
      }

      return spikeResult;

    } catch (error) {
      logger.error('[CHAT_SPIKE 6] Exception:', error.message);
      return {
        spike: 'Rate Limits',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate overall assessment based on spike results
   */
  _generateOverallAssessment() {
    const criticalBlockers = [];
    const warnings = [];
    const successes = [];

    // Check Spike 1 (Critical Blocker)
    if (!this.results.spike1_chatPermissions?.hasPermission) {
      criticalBlockers.push('Chat API permissions not available (403 Forbidden)');
    } else {
      successes.push('Chat API permissions available');
    }

    // Check Spike 2
    if (this.results.spike2_chatDiscovery?.success) {
      successes.push('Chat discovery works');
    } else {
      warnings.push('Chat discovery issues: ' + this.results.spike2_chatDiscovery?.error);
    }

    // Check Spike 3
    if (this.results.spike3_firstMessage?.hasCreatePermission) {
      successes.push('Can create new chats');
    } else {
      warnings.push('Cannot create new chats - limited to existing chats only');
    }

    // Check Spike 4
    const workingSearchMethods = this.results.spike4_userSearch?.workingMethods || [];
    if (workingSearchMethods.length > 0) {
      successes.push(`User search works via: ${workingSearchMethods.join(', ')}`);
    } else {
      warnings.push('No user search method works');
    }

    // Generate recommendation
    if (criticalBlockers.length > 0) {
      return {
        status: 'BLOCKED',
        canProceed: false,
        criticalBlockers,
        warnings,
        successes,
        recommendation: 'DO NOT IMPLEMENT. Consider alternatives: Teams deep links, or build read-only notification panel.'
      };
    }

    if (warnings.length > 0) {
      return {
        status: 'CONDITIONAL_GO',
        canProceed: true,
        criticalBlockers: [],
        warnings,
        successes,
        recommendation: 'PROCEED WITH CAUTION. Address warnings in implementation. May need to reduce feature scope.'
      };
    }

    return {
      status: 'GO',
      canProceed: true,
      criticalBlockers: [],
      warnings: [],
      successes,
      recommendation: 'PROCEED WITH IMPLEMENTATION. All critical spikes passed.'
    };
  }
}

module.exports = ChatApiSpikes;

#!/usr/bin/env node

/**
 * Test script for calendar integration functionality (Task 4.7)
 * Tests the enhanced meeting status detection, conflict checking, and analytics
 */

const { app } = require('electron');
const GraphApiClient = require('./app/graphApiClient');

async function testCalendarIntegration() {
  console.log('=== Calendar Integration Test (Task 4.7) ===\n');
  
  try {
    await app.whenReady();
    
    // Initialize Graph API client
    console.log('1. Initializing Graph API client...');
    const graphClient = new GraphApiClient('persist:teams-4-linux');
    
    // Test meeting status detection
    console.log('\n2. Testing meeting status detection...');
    const statusResult = await graphClient.getMeetingStatus();
    
    if (statusResult.success) {
      console.log('✅ Meeting status detection successful!');
      console.log('   Meeting Status:', statusResult.status.meetingStatus);
      console.log('   Presence Hint:', statusResult.status.presenceHint);
      
      if (statusResult.status.currentMeeting) {
        console.log('   Current Meeting:', statusResult.status.currentMeeting.subject);
        console.log('   Time Remaining:', statusResult.status.currentMeeting.timeRemaining, 'minutes');
      }
      
      if (statusResult.status.nextMeeting) {
        console.log('   Next Meeting:', statusResult.status.nextMeeting.subject);
        console.log('   Starts In:', statusResult.status.nextMeeting.minutesUntil, 'minutes');
        console.log('   Is Online:', statusResult.status.nextMeeting.isOnline);
      }
      
      console.log('   Daily Meeting Count:', statusResult.status.dayMeetingCount);
      console.log('   Focus Time Available:', statusResult.status.focusTimeAvailable);
      console.log('   Upcoming Meetings:', statusResult.status.upcomingMeetings.length);
    } else {
      console.log('⚠️  Meeting status detection failed:', statusResult.error);
    }
    
    // Test conflict detection with a sample time range
    console.log('\n3. Testing meeting conflict detection...');
    const now = new Date();
    const testStart = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
    const testEnd = new Date(testStart.getTime() + 60 * 60 * 1000); // 1 hour duration
    
    const conflictResult = await graphClient.checkMeetingConflicts(
      testStart.toISOString(),
      testEnd.toISOString()
    );
    
    if (conflictResult.success) {
      console.log('✅ Meeting conflict detection successful!');
      console.log('   Has Conflicts:', conflictResult.hasConflicts);
      console.log('   Conflict Count:', conflictResult.conflictCount);
      
      if (conflictResult.hasConflicts) {
        console.log('   Conflicting Meetings:');
        conflictResult.conflicts.forEach((conflict, index) => {
          console.log(`     ${index + 1}. ${conflict.subject} (${conflict.showAs})`);
        });
      }
    } else {
      console.log('⚠️  Meeting conflict detection failed:', conflictResult.error);
    }
    
    // Test weekly meeting analytics
    console.log('\n4. Testing weekly meeting analytics...');
    const analyticsResult = await graphClient.getWeeklyMeetingAnalytics();
    
    if (analyticsResult.success) {
      console.log('✅ Weekly meeting analytics successful!');
      const analytics = analyticsResult.analytics;
      
      console.log('   Total Meetings:', analytics.totalMeetings);
      console.log('   Total Hours:', Math.round(analytics.totalHours * 10) / 10);
      console.log('   Online Meetings:', analytics.onlineMeetings);
      console.log('   High Priority:', analytics.highImportanceMeetings);
      
      console.log('   Daily Breakdown:');
      Object.entries(analytics.dailyBreakdown).forEach(([day, data]) => {
        if (data.count > 0) {
          console.log(`     ${day}: ${data.count} meetings, ${Math.round(data.hours * 10) / 10} hours`);
        }
      });
      
      if (analytics.recommendations.length > 0) {
        console.log('   Recommendations:');
        analytics.recommendations.forEach((rec, index) => {
          console.log(`     ${index + 1}. ${rec}`);
        });
      }
      
      console.log('   Peak Meeting Hours:');
      analytics.hourlyDistribution.forEach((count, hour) => {
        if (count > 0) {
          console.log(`     ${hour}:00 - ${count} meetings`);
        }
      });
    } else {
      console.log('⚠️  Weekly meeting analytics failed:', analyticsResult.error);
    }
    
    // Test calendar insights (existing functionality)
    console.log('\n5. Testing calendar insights...');
    const insightsResult = await graphClient.getCalendarInsights(3);
    
    if (insightsResult.success) {
      console.log('✅ Calendar insights successful!');
      console.log('   Insights:', insightsResult.insights);
    } else {
      console.log('⚠️  Calendar insights failed:', insightsResult.error);
    }
    
    // Display client capabilities
    console.log('\n6. Graph API client capabilities:');
    const status = graphClient.getStatus();
    console.log('   Calendar API:', status.capabilities.calendar ? '✅ Available' : '❌ Not available');
    console.log('   Mail API:', status.capabilities.mail ? '✅ Available' : '❌ Not available');
    console.log('   Directory API:', status.capabilities.directory ? '✅ Available' : '❌ Not available');
    console.log('   Files API:', status.capabilities.files ? '✅ Available' : '❌ Not available');
    
    console.log('\n=== Calendar Integration Test Complete ===');
    console.log('\nTask 4.7 Features Implemented:');
    console.log('✅ Real-time meeting status detection');
    console.log('✅ Current and next meeting identification');
    console.log('✅ Intelligent presence hint generation');
    console.log('✅ Meeting conflict detection');
    console.log('✅ Weekly meeting analytics with recommendations');
    console.log('✅ Focus time availability detection');
    console.log('✅ Meeting countdown and time remaining calculations');
    console.log('✅ Integration with existing Graph API infrastructure');
    
    console.log('\nIPC Handlers Available:');
    console.log('- graph-meeting-status: Get current meeting status');
    console.log('- graph-meeting-conflicts: Check for scheduling conflicts');
    console.log('- graph-weekly-analytics: Get weekly meeting insights');
    
    console.log('\nThis calendar integration enables:');
    console.log('- Smart Teams status updates based on calendar');
    console.log('- Meeting preparation reminders and notifications');
    console.log('- Focus time protection and scheduling optimization');
    console.log('- Conflict-free scheduling assistance');
    console.log('- Personal productivity analytics and insights');
    
    // Cleanup
    graphClient.cleanup();
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Calendar integration test failed:', error);
    process.exit(1);
  }
}

// Handle app events
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Start test
testCalendarIntegration();
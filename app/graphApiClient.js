/**
 * Graph API Client - High-level client for Microsoft Graph API integration
 * This provides user-friendly methods for personal productivity features
 * Built on top of SecureTokenExtractor for secure token management
 */

const SecureTokenExtractor = require('./secureTokenExtractor');

class GraphApiClient {
  
  constructor(partitionName = 'persist:teams-4-linux') {
    this.tokenExtractor = new SecureTokenExtractor(partitionName);
    this.initialized = false;
    this.capabilities = {
      calendar: false,
      mail: false,
      files: false,
      directory: false,
      presence: false
    };
  }

  /**
   * Initialize the Graph API client and test capabilities
   */
  async initialize() {
    try {
      console.log('GraphApiClient: Initializing...');
      
      // Test basic connection
      const connected = await this.tokenExtractor.testGraphConnection();
      if (!connected) {
        console.log('GraphApiClient: No Graph API access available');
        return false;
      }

      // Test available capabilities
      await this.testCapabilities();
      
      // Start token refresh
      this.tokenExtractor.startTokenRefresh(5); // 5-minute refresh
      
      this.initialized = true;
      console.log('GraphApiClient: ✅ Initialized successfully');
      console.log('GraphApiClient: Available capabilities:', this.capabilities);
      
      return true;
      
    } catch (error) {
      console.error('GraphApiClient: Initialization failed:', error);
      return false;
    }
  }

  /**
   * Test what Graph API capabilities are available
   */
  async testCapabilities() {
    const tests = [
      { name: 'calendar', endpoint: '/me/calendars', scope: 'Calendars.Read' },
      { name: 'mail', endpoint: '/me/messages?$top=1', scope: 'Mail.Read' },
      { name: 'files', endpoint: '/me/drive/root/children?$top=1', scope: 'Files.ReadWrite.All' },
      { name: 'directory', endpoint: '/me', scope: 'User.ReadBasic.All' },
      { name: 'presence', endpoint: '/me/presence', scope: 'Presence.Read' }
    ];

    for (const test of tests) {
      try {
        const result = await this.tokenExtractor.makeGraphApiRequest(test.endpoint);
        this.capabilities[test.name] = result.success;
        
        if (result.success) {
          console.debug(`GraphApiClient: ✅ ${test.name} API available`);
        } else {
          console.debug(`GraphApiClient: ❌ ${test.name} API unavailable:`, result.error);
        }
      } catch (error) {
        console.debug(`GraphApiClient: ❌ ${test.name} API test failed:`, error.message);
        this.capabilities[test.name] = false;
      }
    }
  }

  // ============== PERSONAL PRODUCTIVITY FEATURES ==============

  /**
   * VIP Email Alerts - Get important unread emails
   */
  async getVipEmails(vipSenders = [], urgentKeywords = ['urgent', 'asap', 'emergency']) {
    try {
      if (!this.capabilities.mail) {
        return { success: false, error: 'Mail API not available' };
      }

      // Get unread emails from last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endpoint = `/me/messages?$filter=isRead eq false and receivedDateTime ge ${yesterday}&$select=id,subject,from,receivedDateTime,importance,bodyPreview&$orderby=receivedDateTime desc&$top=50`;
      
      const result = await this.tokenExtractor.makeGraphApiRequest(endpoint);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const emails = result.data.value || [];
      
      // Classify emails by importance
      const vipEmails = [];
      const urgentEmails = [];
      
      for (const email of emails) {
        const sender = email.from?.emailAddress?.address?.toLowerCase() || '';
        const subject = email.subject?.toLowerCase() || '';
        const isVip = vipSenders.some(vip => sender.includes(vip.toLowerCase()));
        const isUrgent = urgentKeywords.some(keyword => subject.includes(keyword.toLowerCase()));
        const isHighImportance = email.importance === 'high';
        
        if (isVip || isHighImportance) {
          vipEmails.push({
            id: email.id,
            subject: email.subject,
            sender: email.from?.emailAddress?.address,
            senderName: email.from?.emailAddress?.name,
            receivedDateTime: email.receivedDateTime,
            importance: email.importance,
            preview: email.bodyPreview?.substring(0, 100),
            reason: isVip ? 'VIP Sender' : 'High Importance'
          });
        }
        
        if (isUrgent) {
          urgentEmails.push({
            id: email.id,
            subject: email.subject,
            sender: email.from?.emailAddress?.address,
            senderName: email.from?.emailAddress?.name,
            receivedDateTime: email.receivedDateTime,
            preview: email.bodyPreview?.substring(0, 100),
            reason: 'Urgent Keywords'
          });
        }
      }

      return {
        success: true,
        vipEmails: vipEmails,
        urgentEmails: urgentEmails,
        totalUnread: emails.length
      };

    } catch (error) {
      console.error('GraphApiClient: Error getting VIP emails:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Meeting Preparation Assistant - Get relevant files and context for upcoming meeting
   */
  async prepareMeeting(meetingSubject, attendeeEmails = [], timeWindow = 7) {
    try {
      if (!this.capabilities.calendar || !this.capabilities.files) {
        return { success: false, error: 'Calendar or Files API not available' };
      }

      const preparation = {
        relevantFiles: [],
        recentEmails: [],
        attendeeContext: [],
        nextMeeting: null
      };

      // Get upcoming meetings
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000); // Next 24 hours
      
      const meetingsResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/calendar/calendarView?startDateTime=${startTime.toISOString()}&endDateTime=${endTime.toISOString()}&$filter=contains(subject,'${meetingSubject}')&$select=id,subject,start,end,attendees,location&$orderby=start/dateTime`
      );

      if (meetingsResult.success && meetingsResult.data.value?.length > 0) {
        preparation.nextMeeting = meetingsResult.data.value[0];
      }

      // Get recent files modified in last `timeWindow` days
      const windowStart = new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000).toISOString();
      const filesResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/drive/root/search(q='${meetingSubject}')?$filter=lastModifiedDateTime ge ${windowStart}&$select=id,name,lastModifiedDateTime,webUrl,size&$orderby=lastModifiedDateTime desc&$top=10`
      );

      if (filesResult.success) {
        preparation.relevantFiles = filesResult.data.value?.map(file => ({
          id: file.id,
          name: file.name,
          lastModified: file.lastModifiedDateTime,
          webUrl: file.webUrl,
          size: file.size,
          relevance: 'Subject Match'
        })) || [];
      }

      // Get recent email threads related to meeting
      if (this.capabilities.mail) {
        const emailResult = await this.tokenExtractor.makeGraphApiRequest(
          `/me/messages?$search="${meetingSubject}"&$select=id,subject,from,receivedDateTime,bodyPreview&$orderby=receivedDateTime desc&$top=5`
        );

        if (emailResult.success) {
          preparation.recentEmails = emailResult.data.value?.map(email => ({
            id: email.id,
            subject: email.subject,
            from: email.from?.emailAddress?.name || email.from?.emailAddress?.address,
            receivedDateTime: email.receivedDateTime,
            preview: email.bodyPreview?.substring(0, 150)
          })) || [];
        }
      }

      // Get attendee context if directory access available
      if (this.capabilities.directory && attendeeEmails.length > 0) {
        for (const email of attendeeEmails.slice(0, 5)) { // Limit to 5 attendees
          try {
            const userResult = await this.tokenExtractor.makeGraphApiRequest(`/users/${email}?$select=displayName,jobTitle,department,officeLocation`);
            if (userResult.success) {
              preparation.attendeeContext.push({
                email: email,
                name: userResult.data.displayName,
                title: userResult.data.jobTitle,
                department: userResult.data.department,
                location: userResult.data.officeLocation
              });
            }
          } catch (error) {
            console.debug('GraphApiClient: Could not get attendee info for:', email);
          }
        }
      }

      return { success: true, preparation };

    } catch (error) {
      console.error('GraphApiClient: Error preparing meeting:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enhanced Meeting Status Detection - Core calendar integration functionality
   * Provides real-time meeting status, upcoming meetings, and intelligent notifications
   */
  async getMeetingStatus() {
    try {
      if (!this.capabilities.calendar) {
        return { success: false, error: 'Calendar API not available' };
      }

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);

      // Get current and upcoming meetings
      const endpoint = `/me/calendar/calendarView?startDateTime=${oneHourAgo.toISOString()}&endDateTime=${fourHoursLater.toISOString()}&$select=id,subject,start,end,location,attendees,organizer,isOnlineMeeting,onlineMeetingUrl,showAs,sensitivity,importance`;
      const result = await this.tokenExtractor.makeGraphApiRequest(endpoint);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const events = result.data.value || [];
      const status = {
        currentMeeting: null,
        nextMeeting: null,
        upcomingMeetings: [],
        meetingStatus: 'available', // available, in-meeting, between-meetings, busy
        presenceHint: 'Available',
        nextMeetingIn: null,
        dayMeetingCount: 0,
        focusTimeAvailable: false
      };

      // Sort events by start time
      const sortedEvents = events.sort((a, b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));

      // Find current meeting
      for (const event of sortedEvents) {
        const startTime = new Date(event.start.dateTime);
        const endTime = new Date(event.end.dateTime);
        
        if (now >= startTime && now <= endTime) {
          status.currentMeeting = {
            id: event.id,
            subject: event.subject,
            start: event.start.dateTime,
            end: event.end.dateTime,
            location: event.location?.displayName || 'Not specified',
            isOnline: event.isOnlineMeeting,
            meetingUrl: event.onlineMeetingUrl,
            organizer: event.organizer?.emailAddress?.name || 'Unknown',
            attendeeCount: event.attendees?.length || 0,
            importance: event.importance,
            showAs: event.showAs,
            timeRemaining: Math.round((endTime - now) / 60000) // minutes
          };
          status.meetingStatus = 'in-meeting';
          status.presenceHint = 'In a meeting';
          break;
        }
      }

      // Find next meeting if not currently in one
      if (!status.currentMeeting) {
        const futureMeetings = sortedEvents.filter(event => new Date(event.start.dateTime) > now);
        
        if (futureMeetings.length > 0) {
          const nextEvent = futureMeetings[0];
          const startTime = new Date(nextEvent.start.dateTime);
          const minutesUntil = Math.round((startTime - now) / 60000);
          
          status.nextMeeting = {
            id: nextEvent.id,
            subject: nextEvent.subject,
            start: nextEvent.start.dateTime,
            end: nextEvent.end.dateTime,
            location: nextEvent.location?.displayName || 'Not specified',
            isOnline: nextEvent.isOnlineMeeting,
            meetingUrl: nextEvent.onlineMeetingUrl,
            organizer: nextEvent.organizer?.emailAddress?.name || 'Unknown',
            attendeeCount: nextEvent.attendees?.length || 0,
            importance: nextEvent.importance,
            minutesUntil: minutesUntil
          };
          
          status.nextMeetingIn = `${minutesUntil} minutes`;
          
          if (minutesUntil <= 15) {
            status.meetingStatus = 'meeting-soon';
            status.presenceHint = `Meeting in ${minutesUntil} minutes`;
          } else if (minutesUntil <= 60) {
            status.meetingStatus = 'between-meetings';
            status.presenceHint = `Next meeting in ${minutesUntil} minutes`;
          } else {
            status.meetingStatus = 'available';
            status.presenceHint = 'Available';
            status.focusTimeAvailable = true;
          }
          
          // Get additional upcoming meetings
          status.upcomingMeetings = futureMeetings.slice(0, 5).map(event => ({
            id: event.id,
            subject: event.subject,
            start: event.start.dateTime,
            end: event.end.dateTime,
            isOnline: event.isOnlineMeeting,
            organizer: event.organizer?.emailAddress?.name,
            minutesUntil: Math.round((new Date(event.start.dateTime) - now) / 60000)
          }));
        } else {
          status.meetingStatus = 'available';
          status.presenceHint = 'Available';
          status.focusTimeAvailable = true;
        }
      }

      // Count total meetings for the day
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      
      const todayEventsResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/calendar/calendarView?startDateTime=${todayStart.toISOString()}&endDateTime=${todayEnd.toISOString()}&$select=id`
      );
      
      if (todayEventsResult.success) {
        status.dayMeetingCount = todayEventsResult.data.value?.length || 0;
      }

      return { success: true, status };

    } catch (error) {
      console.error('GraphApiClient: Error getting meeting status:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Meeting Conflict Detection - Check for scheduling conflicts
   */
  async checkMeetingConflicts(startDateTime, endDateTime, excludeEventId = null) {
    try {
      if (!this.capabilities.calendar) {
        return { success: false, error: 'Calendar API not available' };
      }

      const endpoint = `/me/calendar/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$select=id,subject,start,end,showAs`;
      const result = await this.tokenExtractor.makeGraphApiRequest(endpoint);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const conflicts = (result.data.value || [])
        .filter(event => event.id !== excludeEventId && event.showAs !== 'free')
        .map(event => ({
          id: event.id,
          subject: event.subject,
          start: event.start.dateTime,
          end: event.end.dateTime,
          showAs: event.showAs
        }));

      return {
        success: true,
        hasConflicts: conflicts.length > 0,
        conflicts: conflicts,
        conflictCount: conflicts.length
      };

    } catch (error) {
      console.error('GraphApiClient: Error checking meeting conflicts:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Weekly Meeting Analytics - Get meeting patterns and recommendations
   */
  async getWeeklyMeetingAnalytics() {
    try {
      if (!this.capabilities.calendar) {
        return { success: false, error: 'Calendar API not available' };
      }

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay()); // Start of current week
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      weekEnd.setHours(23, 59, 59, 999);

      const endpoint = `/me/calendar/calendarView?startDateTime=${weekStart.toISOString()}&endDateTime=${weekEnd.toISOString()}&$select=id,subject,start,end,attendees,organizer,isOnlineMeeting,showAs,importance`;
      const result = await this.tokenExtractor.makeGraphApiRequest(endpoint);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const events = result.data.value || [];
      const analytics = {
        totalMeetings: events.length,
        totalHours: 0,
        onlineMeetings: 0,
        highImportanceMeetings: 0,
        dailyBreakdown: {},
        hourlyDistribution: Array(24).fill(0),
        organizerStats: {},
        recommendations: []
      };

      // Initialize daily breakdown
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      days.forEach(day => analytics.dailyBreakdown[day] = { count: 0, hours: 0 });

      // Process each event
      events.forEach(event => {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const durationHours = (end - start) / (1000 * 60 * 60);
        const dayName = days[start.getDay()];
        const hour = start.getHours();
        
        analytics.totalHours += durationHours;
        analytics.dailyBreakdown[dayName].count++;
        analytics.dailyBreakdown[dayName].hours += durationHours;
        analytics.hourlyDistribution[hour]++;
        
        if (event.isOnlineMeeting) analytics.onlineMeetings++;
        if (event.importance === 'high') analytics.highImportanceMeetings++;
        
        const organizer = event.organizer?.emailAddress?.address || 'Unknown';
        analytics.organizerStats[organizer] = (analytics.organizerStats[organizer] || 0) + 1;
      });

      // Generate recommendations
      if (analytics.totalHours > 20) {
        analytics.recommendations.push('Consider blocking focus time - you have over 20 hours of meetings this week');
      }
      
      const busiestDay = Object.entries(analytics.dailyBreakdown)
        .sort(([,a], [,b]) => b.count - a.count)[0];
      
      if (busiestDay[1].count > 5) {
        analytics.recommendations.push(`${busiestDay[0]} is very busy with ${busiestDay[1].count} meetings - consider rescheduling some`);
      }
      
      const peakHour = analytics.hourlyDistribution.indexOf(Math.max(...analytics.hourlyDistribution));
      if (analytics.hourlyDistribution[peakHour] > 3) {
        analytics.recommendations.push(`${peakHour}:00 is your busiest meeting hour - consider protecting adjacent time for preparation`);
      }

      return { success: true, analytics };

    } catch (error) {
      console.error('GraphApiClient: Error getting weekly meeting analytics:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Smart Focus Time Protector - Get calendar insights for optimal focus time
   */
  async getCalendarInsights(daysAhead = 7) {
    try {
      if (!this.capabilities.calendar) {
        return { success: false, error: 'Calendar API not available' };
      }

      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      
      const eventsResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/calendar/calendarView?startDateTime=${startTime.toISOString()}&endDateTime=${endTime.toISOString()}&$select=id,subject,start,end,showAs,sensitivity,isAllDay,attendees`
      );

      if (!eventsResult.success) {
        return { success: false, error: eventsResult.error };
      }

      const events = eventsResult.data.value || [];
      
      // Analyze calendar patterns
      const insights = {
        totalMeetings: events.length,
        busyHours: 0,
        freeSlots: [],
        meetingPatterns: {
          morningMeetings: 0,
          afternoonMeetings: 0,
          longMeetings: 0, // > 1 hour
          backToBackMeetings: 0
        },
        suggestions: []
      };

      // Calculate busy hours
      let totalBusyMinutes = 0;
      for (const event of events) {
        if (!event.isAllDay) {
          const start = new Date(event.start.dateTime);
          const end = new Date(event.end.dateTime);
          totalBusyMinutes += (end - start) / (1000 * 60);
          
          // Pattern analysis
          const hour = start.getHours();
          if (hour < 12) insights.meetingPatterns.morningMeetings++;
          else insights.meetingPatterns.afternoonMeetings++;
          
          if ((end - start) / (1000 * 60) > 60) {
            insights.meetingPatterns.longMeetings++;
          }
        }
      }
      
      insights.busyHours = Math.round(totalBusyMinutes / 60 * 10) / 10;

      // Generate suggestions
      if (insights.meetingPatterns.morningMeetings > insights.meetingPatterns.afternoonMeetings * 2) {
        insights.suggestions.push("Consider blocking afternoon time for deep work");
      }
      
      if (insights.busyHours / daysAhead > 6) {
        insights.suggestions.push("Calendar is very busy - consider declining optional meetings");
      }
      
      if (insights.meetingPatterns.longMeetings > 5) {
        insights.suggestions.push("Many long meetings scheduled - ensure they have clear agendas");
      }

      return { success: true, insights };

    } catch (error) {
      console.error('GraphApiClient: Error getting calendar insights:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calendar-Based Smart Presence - Infer presence from calendar events
   */
  async getSmartPresence() {
    try {
      if (!this.capabilities.calendar) {
        return { success: false, error: 'Calendar API not available' };
      }

      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      
      // Get current and next hour events
      const eventsResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/calendar/calendarView?startDateTime=${now.toISOString()}&endDateTime=${oneHourLater.toISOString()}&$select=id,subject,start,end,showAs,attendees,location`
      );

      if (!eventsResult.success) {
        return { success: false, error: eventsResult.error };
      }

      const events = eventsResult.data.value || [];
      const currentEvent = events.find(event => {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        return start <= now && end > now;
      });

      const nextEvent = events.find(event => {
        const start = new Date(event.start.dateTime);
        return start > now;
      });

      let presence = {
        status: 'Available',
        activity: 'Available',
        message: '',
        until: null
      };

      if (currentEvent) {
        const endTime = new Date(currentEvent.end.dateTime);
        const attendeeCount = currentEvent.attendees?.length || 0;
        
        if (attendeeCount > 1) {
          presence = {
            status: 'InAMeeting',
            activity: 'InAMeeting',
            message: `📅 ${currentEvent.subject}`,
            until: endTime.toISOString()
          };
        } else {
          presence = {
            status: 'Busy',
            activity: 'InACall',
            message: `🎯 ${currentEvent.subject}`,
            until: endTime.toISOString()
          };
        }
      } else if (nextEvent) {
        const startTime = new Date(nextEvent.start.dateTime);
        const minutesUntil = Math.round((startTime - now) / (1000 * 60));
        
        if (minutesUntil <= 15) {
          presence = {
            status: 'AvailableIdle',
            activity: 'Available',
            message: `📅 Meeting in ${minutesUntil}min`,
            until: startTime.toISOString()
          };
        }
      }

      return { success: true, presence, currentEvent, nextEvent };

    } catch (error) {
      console.error('GraphApiClient: Error getting smart presence:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Personal File Assistant - Get recent and relevant files
   */
  async getPersonalFiles(options = {}) {
    try {
      if (!this.capabilities.files) {
        return { success: false, error: 'Files API not available' };
      }

      const { 
        daysBack = 7, 
        maxResults = 20, 
        fileTypes = ['docx', 'xlsx', 'pptx', 'pdf', 'txt'] 
      } = options;

      const windowStart = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      
      // Get recently modified files
      const filesResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/drive/root/search(q='*')?$filter=lastModifiedDateTime ge ${windowStart}&$select=id,name,lastModifiedDateTime,webUrl,size,file&$orderby=lastModifiedDateTime desc&$top=${maxResults}`
      );

      if (!filesResult.success) {
        return { success: false, error: filesResult.error };
      }

      const files = (filesResult.data.value || [])
        .filter(file => {
          if (!file.file || !file.name) return false;
          const extension = file.name.split('.').pop()?.toLowerCase();
          return fileTypes.includes(extension);
        })
        .map(file => ({
          id: file.id,
          name: file.name,
          lastModified: file.lastModifiedDateTime,
          webUrl: file.webUrl,
          size: file.size,
          type: file.name.split('.').pop()?.toLowerCase(),
          isRecent: (Date.now() - new Date(file.lastModifiedDateTime)) < (24 * 60 * 60 * 1000) // Within 24h
        }));

      return {
        success: true,
        files: files,
        summary: {
          total: files.length,
          recentFiles: files.filter(f => f.isRecent).length,
          fileTypes: [...new Set(files.map(f => f.type))]
        }
      };

    } catch (error) {
      console.error('GraphApiClient: Error getting personal files:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Quick Email Actions - Mark emails as read, reply, forward
   */
  async markEmailAsRead(emailId) {
    try {
      if (!this.capabilities.mail) {
        return { success: false, error: 'Mail API not available' };
      }

      const result = await this.tokenExtractor.makeGraphApiRequest(
        `/me/messages/${emailId}`,
        {
          method: 'PATCH',
          body: { isRead: true }
        }
      );

      return { success: result.success, error: result.error };

    } catch (error) {
      console.error('GraphApiClient: Error marking email as read:', error);
      return { success: false, error: error.message };
    }
  }

  // ============== ENHANCED EMAIL INTEGRATION (Task 4.8) ==============

  /**
   * Smart Email Notifications - Get priority emails with intelligent filtering
   */
  async getSmartEmailNotifications(options = {}) {
    try {
      if (!this.capabilities.mail) {
        return { success: false, error: 'Mail API not available' };
      }

      const {
        hoursBack = 2,
        maxEmails = 20,
        includeRead = false,
        prioritySenders = [],
        urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'deadline'],
        categories = ['important', 'flagged']
      } = options;

      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      const readFilter = includeRead ? '' : ' and isRead eq false';
      
      const endpoint = `/me/messages?$filter=receivedDateTime ge ${since}${readFilter}&$select=id,subject,from,receivedDateTime,importance,isRead,hasAttachments,categories,bodyPreview,flag&$orderby=receivedDateTime desc&$top=${maxEmails}`;
      const result = await this.tokenExtractor.makeGraphApiRequest(endpoint);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const emails = result.data.value || [];
      const notifications = {
        criticalEmails: [],
        importantEmails: [],
        flaggedEmails: [],
        attachmentEmails: [],
        totalProcessed: emails.length,
        lastUpdated: new Date().toISOString()
      };

      // Process each email for smart notifications
      for (const email of emails) {
        const sender = email.from?.emailAddress?.address?.toLowerCase() || '';
        const subject = (email.subject || '').toLowerCase();
        const bodyPreview = (email.bodyPreview || '').toLowerCase();
        const senderName = email.from?.emailAddress?.name || email.from?.emailAddress?.address;
        
        // Create email object
        const emailObj = {
          id: email.id,
          subject: email.subject,
          sender: email.from?.emailAddress?.address,
          senderName: senderName,
          receivedDateTime: email.receivedDateTime,
          importance: email.importance,
          isRead: email.isRead,
          hasAttachments: email.hasAttachments,
          preview: email.bodyPreview?.substring(0, 150),
          categories: email.categories || [],
          flag: email.flag,
          reasons: []
        };

        // Check for critical conditions
        const isFromPrioritySender = prioritySenders.some(ps => sender.includes(ps.toLowerCase()));
        const hasUrgentKeywords = urgentKeywords.some(keyword => 
          subject.includes(keyword) || bodyPreview.includes(keyword)
        );
        const isHighImportance = email.importance === 'high';
        const isFlagged = email.flag && email.flag.flagStatus === 'flagged';
        const hasImportantCategory = email.categories?.some(cat => 
          categories.includes(cat.toLowerCase())
        );

        // Classify email
        if (hasUrgentKeywords || (isHighImportance && isFromPrioritySender)) {
          if (hasUrgentKeywords) emailObj.reasons.push('Urgent keywords detected');
          if (isHighImportance) emailObj.reasons.push('High importance');
          if (isFromPrioritySender) emailObj.reasons.push('Priority sender');
          notifications.criticalEmails.push(emailObj);
        }
        
        if (isHighImportance || isFromPrioritySender || hasImportantCategory) {
          if (!notifications.criticalEmails.find(e => e.id === email.id)) {
            if (isHighImportance) emailObj.reasons.push('High importance');
            if (isFromPrioritySender) emailObj.reasons.push('Priority sender');
            if (hasImportantCategory) emailObj.reasons.push('Important category');
            notifications.importantEmails.push(emailObj);
          }
        }
        
        if (isFlagged) {
          emailObj.reasons.push('Flagged for follow-up');
          notifications.flaggedEmails.push(emailObj);
        }
        
        if (email.hasAttachments && !email.isRead) {
          emailObj.reasons.push('Has attachments');
          notifications.attachmentEmails.push(emailObj);
        }
      }

      return { success: true, notifications };

    } catch (error) {
      console.error('GraphApiClient: Error getting smart email notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Email Action Manager - Perform bulk email operations
   */
  async performEmailActions(actions = []) {
    try {
      if (!this.capabilities.mail) {
        return { success: false, error: 'Mail API not available' };
      }

      const results = [];
      
      for (const action of actions) {
        const { type, emailId, data = {} } = action;
        let result = { action: type, emailId, success: false };
        
        try {
          switch (type) {
            case 'markAsRead':
              const readResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/messages/${emailId}`,
                {
                  method: 'PATCH',
                  body: { isRead: true }
                }
              );
              result.success = readResult.success;
              result.error = readResult.error;
              break;
              
            case 'markAsUnread':
              const unreadResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/messages/${emailId}`,
                {
                  method: 'PATCH',
                  body: { isRead: false }
                }
              );
              result.success = unreadResult.success;
              result.error = unreadResult.error;
              break;
              
            case 'flag':
              const flagResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/messages/${emailId}`,
                {
                  method: 'PATCH',
                  body: { flag: { flagStatus: 'flagged' } }
                }
              );
              result.success = flagResult.success;
              result.error = flagResult.error;
              break;
              
            case 'unflag':
              const unflagResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/messages/${emailId}`,
                {
                  method: 'PATCH',
                  body: { flag: { flagStatus: 'notFlagged' } }
                }
              );
              result.success = unflagResult.success;
              result.error = unflagResult.error;
              break;
              
            case 'delete':
              const deleteResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/messages/${emailId}`,
                { method: 'DELETE' }
              );
              result.success = deleteResult.success;
              result.error = deleteResult.error;
              break;
              
            case 'move':
              const folderId = data.folderId;
              if (!folderId) {
                result.error = 'folderId required for move action';
                break;
              }
              const moveResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/messages/${emailId}/move`,
                {
                  method: 'POST',
                  body: { destinationId: folderId }
                }
              );
              result.success = moveResult.success;
              result.error = moveResult.error;
              break;
              
            case 'addCategory':
              const category = data.category;
              if (!category) {
                result.error = 'category required for addCategory action';
                break;
              }
              const addCatResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/messages/${emailId}`,
                {
                  method: 'PATCH',
                  body: { categories: [category] }
                }
              );
              result.success = addCatResult.success;
              result.error = addCatResult.error;
              break;
              
            default:
              result.error = `Unknown action type: ${type}`;
          }
        } catch (actionError) {
          result.error = actionError.message;
        }
        
        results.push(result);
      }
      
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        results,
        summary: {
          total: actions.length,
          successful: successCount,
          failed: actions.length - successCount
        }
      };

    } catch (error) {
      console.error('GraphApiClient: Error performing email actions:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Email Search and Organization - Advanced email search with organization features
   */
  async searchAndOrganizeEmails(searchQuery, options = {}) {
    try {
      if (!this.capabilities.mail) {
        return { success: false, error: 'Mail API not available' };
      }

      const {
        maxResults = 50,
        orderBy = 'receivedDateTime desc',
        includeRead = true,
        dateRange = null, // { start: ISO string, end: ISO string }
        folder = null,
        attachmentsOnly = false,
        highImportanceOnly = false
      } = options;

      // Build search filter
      let filter = '';
      const filters = [];
      
      if (!includeRead) filters.push('isRead eq false');
      if (attachmentsOnly) filters.push('hasAttachments eq true');
      if (highImportanceOnly) filters.push('importance eq \'high\'');
      if (dateRange) {
        filters.push(`receivedDateTime ge ${dateRange.start}`);
        filters.push(`receivedDateTime le ${dateRange.end}`);
      }
      
      if (filters.length > 0) {
        filter = `&$filter=${filters.join(' and ')}`;
      }
      
      // Determine endpoint based on folder
      let endpoint;
      if (folder) {
        endpoint = `/me/mailFolders/${folder}/messages?$search="${searchQuery}"&$select=id,subject,from,receivedDateTime,importance,isRead,hasAttachments,categories,bodyPreview,flag&$orderby=${orderBy}&$top=${maxResults}${filter}`;
      } else {
        endpoint = `/me/messages?$search="${searchQuery}"&$select=id,subject,from,receivedDateTime,importance,isRead,hasAttachments,categories,bodyPreview,flag&$orderby=${orderBy}&$top=${maxResults}${filter}`;
      }
      
      const result = await this.tokenExtractor.makeGraphApiRequest(endpoint);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const emails = result.data.value || [];
      
      // Organize results
      const organization = {
        byImportance: { high: [], normal: [], low: [] },
        bySender: {},
        byDate: { today: [], yesterday: [], thisWeek: [], older: [] },
        withAttachments: [],
        flagged: [],
        unread: []
      };
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const thisWeekStart = new Date(today.getTime() - (now.getDay() * 24 * 60 * 60 * 1000));
      
      for (const email of emails) {
        const emailObj = {
          id: email.id,
          subject: email.subject,
          sender: email.from?.emailAddress?.address,
          senderName: email.from?.emailAddress?.name,
          receivedDateTime: email.receivedDateTime,
          importance: email.importance,
          isRead: email.isRead,
          hasAttachments: email.hasAttachments,
          preview: email.bodyPreview?.substring(0, 150),
          categories: email.categories || [],
          flag: email.flag
        };
        
        // Organize by importance
        const importance = email.importance || 'normal';
        if (organization.byImportance[importance]) {
          organization.byImportance[importance].push(emailObj);
        }
        
        // Organize by sender
        const sender = email.from?.emailAddress?.address || 'Unknown';
        if (!organization.bySender[sender]) {
          organization.bySender[sender] = [];
        }
        organization.bySender[sender].push(emailObj);
        
        // Organize by date
        const receivedDate = new Date(email.receivedDateTime);
        if (receivedDate >= today) {
          organization.byDate.today.push(emailObj);
        } else if (receivedDate >= yesterday) {
          organization.byDate.yesterday.push(emailObj);
        } else if (receivedDate >= thisWeekStart) {
          organization.byDate.thisWeek.push(emailObj);
        } else {
          organization.byDate.older.push(emailObj);
        }
        
        // Special categories
        if (email.hasAttachments) organization.withAttachments.push(emailObj);
        if (email.flag && email.flag.flagStatus === 'flagged') organization.flagged.push(emailObj);
        if (!email.isRead) organization.unread.push(emailObj);
      }
      
      return {
        success: true,
        searchQuery,
        totalResults: emails.length,
        emails: emails.map(email => ({
          id: email.id,
          subject: email.subject,
          sender: email.from?.emailAddress?.address,
          senderName: email.from?.emailAddress?.name,
          receivedDateTime: email.receivedDateTime,
          importance: email.importance,
          isRead: email.isRead,
          hasAttachments: email.hasAttachments,
          preview: email.bodyPreview?.substring(0, 150)
        })),
        organization
      };

    } catch (error) {
      console.error('GraphApiClient: Error searching and organizing emails:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Email Folder Management - Get and manage mail folders
   */
  async getMailFolders() {
    try {
      if (!this.capabilities.mail) {
        return { success: false, error: 'Mail API not available' };
      }

      const result = await this.tokenExtractor.makeGraphApiRequest(
        '/me/mailFolders?$select=id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount'
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const folders = result.data.value || [];
      
      // Organize folders hierarchically
      const folderHierarchy = [];
      const folderMap = {};
      
      // Create folder map
      folders.forEach(folder => {
        folderMap[folder.id] = {
          ...folder,
          children: []
        };
      });
      
      // Build hierarchy
      folders.forEach(folder => {
        if (folder.parentFolderId && folderMap[folder.parentFolderId]) {
          folderMap[folder.parentFolderId].children.push(folderMap[folder.id]);
        } else {
          folderHierarchy.push(folderMap[folder.id]);
        }
      });
      
      return {
        success: true,
        folders: folderHierarchy,
        totalFolders: folders.length,
        summary: {
          totalUnread: folders.reduce((sum, f) => sum + (f.unreadItemCount || 0), 0),
          totalItems: folders.reduce((sum, f) => sum + (f.totalItemCount || 0), 0)
        }
      };

    } catch (error) {
      console.error('GraphApiClient: Error getting mail folders:', error);
      return { success: false, error: error.message };
    }
  }

  // ============== FILES INTEGRATION (Task 4.9) ==============

  /**
   * Smart File Discovery - Find recent and relevant files across OneDrive and SharePoint
   */
  async getSmartFileDiscovery(options = {}) {
    try {
      if (!this.capabilities.files) {
        return { success: false, error: 'Files API not available' };
      }

      const {
        daysBack = 7,
        maxFiles = 50,
        fileTypes = ['docx', 'xlsx', 'pptx', 'pdf', 'txt'],
        includeShared = true,
        recentModified = true,
        searchTerm = null
      } = options;

      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      const discovery = {
        recentFiles: [],
        sharedFiles: [],
        importantFiles: [],
        totalFiles: 0,
        fileTypeStats: {},
        lastUpdated: new Date().toISOString()
      };

      // Get recent files from OneDrive
      let oneDriveQuery = `/me/drive/recent?$top=${Math.floor(maxFiles/2)}&$select=id,name,size,lastModifiedDateTime,webUrl,createdBy,lastModifiedBy,file,folder`;
      if (recentModified) {
        oneDriveQuery += `&$filter=lastModifiedDateTime ge ${since}`;
      }
      
      const oneDriveResult = await this.tokenExtractor.makeGraphApiRequest(oneDriveQuery);
      
      if (oneDriveResult.success) {
        const files = oneDriveResult.data.value || [];
        
        for (const file of files) {
          const fileObj = {
            id: file.id,
            name: file.name,
            size: file.size,
            lastModified: file.lastModifiedDateTime,
            webUrl: file.webUrl,
            source: 'OneDrive',
            createdBy: file.createdBy?.user?.displayName,
            lastModifiedBy: file.lastModifiedBy?.user?.displayName,
            isFolder: !!file.folder,
            fileType: file.file ? this.getFileExtension(file.name) : 'folder',
            downloadUrl: file.file ? file.webUrl.replace('view', 'download') : null
          };
          
          // Filter by file type if specified
          if (!file.folder && fileTypes.length > 0) {
            const ext = this.getFileExtension(file.name).toLowerCase();
            if (!fileTypes.includes(ext)) continue;
          }
          
          // Apply search filter
          if (searchTerm && !file.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            continue;
          }
          
          discovery.recentFiles.push(fileObj);
          
          // Update file type stats
          const ext = fileObj.fileType;
          discovery.fileTypeStats[ext] = (discovery.fileTypeStats[ext] || 0) + 1;
        }
      }

      // Get shared files if requested
      if (includeShared) {
        const sharedResult = await this.tokenExtractor.makeGraphApiRequest(
          `/me/drive/sharedWithMe?$top=${Math.floor(maxFiles/3)}&$select=id,name,size,lastModifiedDateTime,webUrl,remoteItem,sharedBy`
        );
        
        if (sharedResult.success) {
          const sharedFiles = sharedResult.data.value || [];
          
          for (const file of sharedFiles) {
            const fileObj = {
              id: file.id,
              name: file.name || file.remoteItem?.name,
              size: file.size || file.remoteItem?.size,
              lastModified: file.lastModifiedDateTime || file.remoteItem?.lastModifiedDateTime,
              webUrl: file.webUrl || file.remoteItem?.webUrl,
              source: 'Shared',
              sharedBy: file.sharedBy?.user?.displayName,
              isFolder: !!(file.folder || file.remoteItem?.folder),
              fileType: file.file || file.remoteItem?.file ? 
                this.getFileExtension(file.name || file.remoteItem?.name) : 'folder'
            };
            
            // Apply filters
            if (!fileObj.isFolder && fileTypes.length > 0) {
              const ext = this.getFileExtension(fileObj.name).toLowerCase();
              if (!fileTypes.includes(ext)) continue;
            }
            
            if (searchTerm && !fileObj.name.toLowerCase().includes(searchTerm.toLowerCase())) {
              continue;
            }
            
            discovery.sharedFiles.push(fileObj);
          }
        }
      }

      // Get important files (recently modified, large files, frequently accessed)
      const importantResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/drive/root/children?$top=20&$select=id,name,size,lastModifiedDateTime,webUrl,createdBy,file&$orderby=lastModifiedDateTime desc`
      );
      
      if (importantResult.success) {
        const files = importantResult.data.value || [];
        
        for (const file of files) {
          if (!file.folder && file.size > 1024 * 1024) { // Files larger than 1MB
            const fileObj = {
              id: file.id,
              name: file.name,
              size: file.size,
              lastModified: file.lastModifiedDateTime,
              webUrl: file.webUrl,
              source: 'OneDrive - Important',
              createdBy: file.createdBy?.user?.displayName,
              fileType: this.getFileExtension(file.name),
              sizeFormatted: this.formatFileSize(file.size),
              reason: 'Large file'
            };
            
            discovery.importantFiles.push(fileObj);
          }
        }
      }

      discovery.totalFiles = discovery.recentFiles.length + discovery.sharedFiles.length + discovery.importantFiles.length;

      return { success: true, discovery };

    } catch (error) {
      console.error('GraphApiClient: Error in smart file discovery:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * File Operations Manager - Upload, download, copy, move, and delete files
   */
  async performFileOperations(operations = []) {
    try {
      if (!this.capabilities.files) {
        return { success: false, error: 'Files API not available' };
      }

      const results = [];
      
      for (const operation of operations) {
        const { type, fileId, fileName, parentId, targetId, data = {} } = operation;
        let result = { operation: type, fileId, fileName, success: false };
        
        try {
          switch (type) {
            case 'download':
              const downloadResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/drive/items/${fileId}/content`
              );
              result.success = downloadResult.success;
              result.downloadUrl = downloadResult.success ? downloadResult.data : null;
              result.error = downloadResult.error;
              break;
              
            case 'copy':
              if (!targetId) {
                result.error = 'targetId required for copy operation';
                break;
              }
              const copyResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/drive/items/${fileId}/copy`,
                {
                  method: 'POST',
                  body: {
                    parentReference: { id: targetId },
                    name: data.newName || fileName
                  }
                }
              );
              result.success = copyResult.success;
              result.error = copyResult.error;
              break;
              
            case 'move':
              if (!targetId) {
                result.error = 'targetId required for move operation';
                break;
              }
              const moveResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/drive/items/${fileId}`,
                {
                  method: 'PATCH',
                  body: {
                    parentReference: { id: targetId },
                    name: data.newName || fileName
                  }
                }
              );
              result.success = moveResult.success;
              result.error = moveResult.error;
              break;
              
            case 'delete':
              const deleteResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/drive/items/${fileId}`,
                { method: 'DELETE' }
              );
              result.success = deleteResult.success;
              result.error = deleteResult.error;
              break;
              
            case 'createFolder':
              if (!parentId) {
                result.error = 'parentId required for createFolder operation';
                break;
              }
              const folderResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/drive/items/${parentId}/children`,
                {
                  method: 'POST',
                  body: {
                    name: data.folderName,
                    folder: {},
                    '@microsoft.graph.conflictBehavior': 'rename'
                  }
                }
              );
              result.success = folderResult.success;
              result.folderId = folderResult.success ? folderResult.data.id : null;
              result.error = folderResult.error;
              break;
              
            case 'rename':
              if (!data.newName) {
                result.error = 'newName required for rename operation';
                break;
              }
              const renameResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/drive/items/${fileId}`,
                {
                  method: 'PATCH',
                  body: { name: data.newName }
                }
              );
              result.success = renameResult.success;
              result.error = renameResult.error;
              break;
              
            case 'getMetadata':
              const metadataResult = await this.tokenExtractor.makeGraphApiRequest(
                `/me/drive/items/${fileId}?$select=id,name,size,lastModifiedDateTime,createdDateTime,webUrl,createdBy,lastModifiedBy,file,folder,shared`
              );
              result.success = metadataResult.success;
              result.metadata = metadataResult.success ? metadataResult.data : null;
              result.error = metadataResult.error;
              break;
              
            default:
              result.error = `Unknown operation type: ${type}`;
          }
        } catch (operationError) {
          result.error = operationError.message;
        }
        
        results.push(result);
      }
      
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        results,
        summary: {
          total: operations.length,
          successful: successCount,
          failed: operations.length - successCount
        }
      };

    } catch (error) {
      console.error('GraphApiClient: Error performing file operations:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * SharePoint Integration - Access and manage SharePoint sites and documents
   */
  async getSharePointIntegration(options = {}) {
    try {
      if (!this.capabilities.files) {
        return { success: false, error: 'Files API not available' };
      }

      const {
        maxSites = 10,
        maxDocuments = 20,
        includeRecentActivity = true,
        searchTerm = null
      } = options;

      const integration = {
        sites: [],
        recentDocuments: [],
        sharedDocuments: [],
        totalSites: 0,
        totalDocuments: 0,
        lastUpdated: new Date().toISOString()
      };

      // Get SharePoint sites the user has access to
      let sitesEndpoint = `/sites?search=*&$top=${maxSites}&$select=id,displayName,webUrl,lastModifiedDateTime,createdDateTime,description`;
      if (searchTerm) {
        sitesEndpoint = `/sites?search=${encodeURIComponent(searchTerm)}&$top=${maxSites}&$select=id,displayName,webUrl,lastModifiedDateTime,createdDateTime,description`;
      }
      
      const sitesResult = await this.tokenExtractor.makeGraphApiRequest(sitesEndpoint);
      
      if (sitesResult.success) {
        const sites = sitesResult.data.value || [];
        
        for (const site of sites) {
          const siteObj = {
            id: site.id,
            displayName: site.displayName,
            webUrl: site.webUrl,
            description: site.description,
            lastModified: site.lastModifiedDateTime,
            created: site.createdDateTime,
            documentLibraries: []
          };
          
          // Get document libraries for each site
          try {
            const librariesResult = await this.tokenExtractor.makeGraphApiRequest(
              `/sites/${site.id}/drives?$select=id,name,webUrl,driveType,createdDateTime`
            );
            
            if (librariesResult.success) {
              siteObj.documentLibraries = librariesResult.data.value?.map(lib => ({
                id: lib.id,
                name: lib.name,
                webUrl: lib.webUrl,
                driveType: lib.driveType,
                created: lib.createdDateTime
              })) || [];
            }
          } catch (libError) {
            console.debug('Error getting document libraries for site:', site.displayName);
          }
          
          integration.sites.push(siteObj);
        }
        
        integration.totalSites = sites.length;
      }

      // Get recent documents across all accessible SharePoint sites
      if (includeRecentActivity) {
        const recentResult = await this.tokenExtractor.makeGraphApiRequest(
          `/me/drive/recent?$top=${maxDocuments}&$select=id,name,size,lastModifiedDateTime,webUrl,parentReference,createdBy,lastModifiedBy`
        );
        
        if (recentResult.success) {
          const recentFiles = recentResult.data.value || [];
          
          integration.recentDocuments = recentFiles
            .filter(file => file.parentReference?.driveType === 'documentLibrary')
            .map(file => ({
              id: file.id,
              name: file.name,
              size: file.size,
              lastModified: file.lastModifiedDateTime,
              webUrl: file.webUrl,
              createdBy: file.createdBy?.user?.displayName,
              lastModifiedBy: file.lastModifiedBy?.user?.displayName,
              fileType: this.getFileExtension(file.name),
              sizeFormatted: this.formatFileSize(file.size)
            }));
        }
      }

      // Get shared documents from SharePoint
      const sharedResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/drive/sharedWithMe?$top=${Math.floor(maxDocuments/2)}&$select=id,name,size,webUrl,remoteItem,sharedBy`
      );
      
      if (sharedResult.success) {
        const sharedFiles = sharedResult.data.value || [];
        
        integration.sharedDocuments = sharedFiles
          .filter(file => (file.remoteItem?.parentReference?.driveType === 'documentLibrary'))
          .map(file => ({
            id: file.id,
            name: file.name || file.remoteItem?.name,
            size: file.size || file.remoteItem?.size,
            webUrl: file.webUrl || file.remoteItem?.webUrl,
            sharedBy: file.sharedBy?.user?.displayName,
            fileType: this.getFileExtension(file.name || file.remoteItem?.name),
            sizeFormatted: this.formatFileSize(file.size || file.remoteItem?.size || 0)
          }));
      }

      integration.totalDocuments = integration.recentDocuments.length + integration.sharedDocuments.length;

      return { success: true, integration };

    } catch (error) {
      console.error('GraphApiClient: Error in SharePoint integration:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * File Analytics and Insights - Get usage patterns and recommendations
   */
  async getFileAnalytics(daysBack = 30) {
    try {
      if (!this.capabilities.files) {
        return { success: false, error: 'Files API not available' };
      }

      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      const analytics = {
        totalFiles: 0,
        totalSize: 0,
        fileTypeBreakdown: {},
        recentActivity: [],
        largestFiles: [],
        mostModified: [],
        storageInsights: {
          oneDriveUsage: 0,
          sharePointUsage: 0,
          totalQuota: 0
        },
        recommendations: [],
        lastUpdated: new Date().toISOString()
      };

      // Get recent file activity
      const recentResult = await this.tokenExtractor.makeGraphApiRequest(
        `/me/drive/recent?$top=100&$select=id,name,size,lastModifiedDateTime,webUrl,createdBy,lastModifiedBy,file,parentReference`
      );
      
      if (recentResult.success) {
        const files = recentResult.data.value || [];
        
        for (const file of files) {
          if (!file.folder) {
            analytics.totalFiles++;
            analytics.totalSize += file.size || 0;
            
            const fileType = this.getFileExtension(file.name);
            analytics.fileTypeBreakdown[fileType] = (analytics.fileTypeBreakdown[fileType] || 0) + 1;
            
            const fileObj = {
              id: file.id,
              name: file.name,
              size: file.size,
              lastModified: file.lastModifiedDateTime,
              webUrl: file.webUrl,
              fileType: fileType,
              sizeFormatted: this.formatFileSize(file.size || 0),
              source: file.parentReference?.driveType === 'business' ? 'OneDrive' : 'SharePoint'
            };
            
            analytics.recentActivity.push(fileObj);
            
            // Track largest files
            if (file.size > 10 * 1024 * 1024) { // Files larger than 10MB
              analytics.largestFiles.push({
                ...fileObj,
                reason: `${this.formatFileSize(file.size)} - Consider archiving`
              });
            }
          }
        }
      }

      // Sort and limit results
      analytics.largestFiles = analytics.largestFiles
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);
        
      analytics.recentActivity = analytics.recentActivity
        .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
        .slice(0, 20);

      // Generate recommendations
      if (analytics.totalSize > 1024 * 1024 * 1024 * 5) { // > 5GB
        analytics.recommendations.push('Consider archiving old files - you have over 5GB of files');
      }
      
      const docFiles = analytics.fileTypeBreakdown['docx'] || 0;
      const pdfFiles = analytics.fileTypeBreakdown['pdf'] || 0;
      
      if (docFiles > pdfFiles * 2) {
        analytics.recommendations.push('Many Word documents detected - consider converting to PDF for sharing');
      }
      
      if (analytics.largestFiles.length > 5) {
        analytics.recommendations.push(`${analytics.largestFiles.length} large files found - review for archiving opportunities`);
      }

      return { success: true, analytics };

    } catch (error) {
      console.error('GraphApiClient: Error getting file analytics:', error);
      return { success: false, error: error.message };
    }
  }

  // ============== DIRECTORY INTEGRATION (Task 4.10) ==============

  /**
   * User Directory Search - Find and lookup users in the organization
   */
  async searchUserDirectory(query, options = {}) {
    try {
      if (!this.capabilities.directory) {
        return { success: false, error: 'Directory API not available' };
      }

      const {
        maxResults = 25,
        includeExtendedInfo = true,
        searchFields = ['displayName', 'mail', 'userPrincipalName', 'jobTitle', 'department']
      } = options;

      // Build search query
      const searchQuery = encodeURIComponent(query);
      const selectFields = includeExtendedInfo ? 
        'id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones,companyName,employeeId,preferredLanguage,accountEnabled,userType' :
        'id,displayName,mail,userPrincipalName';
        
      const endpoint = `/users?$search="displayName:${searchQuery}" OR "mail:${searchQuery}" OR "userPrincipalName:${searchQuery}"&$select=${selectFields}&$top=${maxResults}&$count=true`;
      
      const result = await this.tokenExtractor.makeGraphApiRequest(endpoint, {
        headers: {
          'ConsistencyLevel': 'eventual'
        }
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const users = result.data.value || [];
      const directory = {
        query: query,
        totalResults: result.data['@odata.count'] || users.length,
        users: users.map(user => ({
          id: user.id,
          displayName: user.displayName,
          email: user.mail || user.userPrincipalName,
          userPrincipalName: user.userPrincipalName,
          jobTitle: user.jobTitle,
          department: user.department,
          officeLocation: user.officeLocation,
          phone: user.mobilePhone || (user.businessPhones && user.businessPhones[0]),
          company: user.companyName,
          employeeId: user.employeeId,
          preferredLanguage: user.preferredLanguage,
          isActive: user.accountEnabled,
          userType: user.userType,
          initials: this.generateInitials(user.displayName)
        })),
        searchPerformed: new Date().toISOString()
      };

      return { success: true, directory };

    } catch (error) {
      console.error('GraphApiClient: Error searching user directory:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get User Profile Details - Retrieve detailed profile information
   */
  async getUserProfile(userId, includeManager = true, includeDirectReports = true) {
    try {
      if (!this.capabilities.directory) {
        return { success: false, error: 'Directory API not available' };
      }

      const profile = {
        user: null,
        manager: null,
        directReports: [],
        organizationChart: null
      };

      // Get user details
      const userResult = await this.tokenExtractor.makeGraphApiRequest(
        `/users/${userId}?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones,companyName,employeeId,preferredLanguage,accountEnabled,userType,createdDateTime,lastPasswordChangeDateTime,assignedLicenses,usageLocation`
      );

      if (!userResult.success) {
        return { success: false, error: userResult.error };
      }

      const user = userResult.data;
      profile.user = {
        id: user.id,
        displayName: user.displayName,
        email: user.mail || user.userPrincipalName,
        userPrincipalName: user.userPrincipalName,
        jobTitle: user.jobTitle,
        department: user.department,
        officeLocation: user.officeLocation,
        phone: user.mobilePhone || (user.businessPhones && user.businessPhones[0]),
        company: user.companyName,
        employeeId: user.employeeId,
        preferredLanguage: user.preferredLanguage,
        isActive: user.accountEnabled,
        userType: user.userType,
        createdDate: user.createdDateTime,
        lastPasswordChange: user.lastPasswordChangeDateTime,
        usageLocation: user.usageLocation,
        licenseCount: user.assignedLicenses ? user.assignedLicenses.length : 0,
        initials: this.generateInitials(user.displayName)
      };

      // Get manager if requested
      if (includeManager) {
        try {
          const managerResult = await this.tokenExtractor.makeGraphApiRequest(
            `/users/${userId}/manager?$select=id,displayName,mail,jobTitle,department`
          );
          
          if (managerResult.success) {
            profile.manager = {
              id: managerResult.data.id,
              displayName: managerResult.data.displayName,
              email: managerResult.data.mail,
              jobTitle: managerResult.data.jobTitle,
              department: managerResult.data.department
            };
          }
        } catch {
          // Manager may not exist, ignore error
        }
      }

      // Get direct reports if requested
      if (includeDirectReports) {
        try {
          const reportsResult = await this.tokenExtractor.makeGraphApiRequest(
            `/users/${userId}/directReports?$select=id,displayName,mail,jobTitle,department&$top=50`
          );
          
          if (reportsResult.success) {
            profile.directReports = reportsResult.data.value?.map(report => ({
              id: report.id,
              displayName: report.displayName,
              email: report.mail,
              jobTitle: report.jobTitle,
              department: report.department
            })) || [];
          }
        } catch {
          // Direct reports may not exist, ignore error
        }
      }

      return { success: true, profile };

    } catch (error) {
      console.error('GraphApiClient: Error getting user profile:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Organization Structure - Get department and team insights
   */
  async getOrganizationStructure(options = {}) {
    try {
      if (!this.capabilities.directory) {
        return { success: false, error: 'Directory API not available' };
      }

      const {
        maxUsers = 100,
        includeDepartmentStats = true,
        includeLocationStats = true
      } = options;

      const structure = {
        departments: {},
        locations: {},
        userTypes: {},
        totalUsers: 0,
        organizationInsights: {
          topDepartments: [],
          topLocations: [],
          userDistribution: {}
        },
        lastUpdated: new Date().toISOString()
      };

      // Get organization users
      const usersResult = await this.tokenExtractor.makeGraphApiRequest(
        `/users?$select=id,displayName,department,officeLocation,userType,accountEnabled,jobTitle,companyName&$top=${maxUsers}&$count=true`,
        {
          headers: {
            'ConsistencyLevel': 'eventual'
          }
        }
      );

      if (!usersResult.success) {
        return { success: false, error: usersResult.error };
      }

      const users = usersResult.data.value || [];
      structure.totalUsers = usersResult.data['@odata.count'] || users.length;

      // Process user data
      for (const user of users) {
        if (!user.accountEnabled) continue;
        
        // Department analysis
        if (user.department) {
          const dept = user.department;
          if (!structure.departments[dept]) {
            structure.departments[dept] = {
              name: dept,
              userCount: 0,
              users: [],
              commonTitles: {}
            };
          }
          structure.departments[dept].userCount++;
          structure.departments[dept].users.push({
            id: user.id,
            name: user.displayName,
            jobTitle: user.jobTitle
          });
          
          // Track common titles in department
          if (user.jobTitle) {
            const title = user.jobTitle;
            structure.departments[dept].commonTitles[title] = 
              (structure.departments[dept].commonTitles[title] || 0) + 1;
          }
        }
        
        // Location analysis
        if (user.officeLocation) {
          const location = user.officeLocation;
          if (!structure.locations[location]) {
            structure.locations[location] = {
              name: location,
              userCount: 0,
              departments: new Set()
            };
          }
          structure.locations[location].userCount++;
          if (user.department) {
            structure.locations[location].departments.add(user.department);
          }
        }
        
        // User type analysis
        const userType = user.userType || 'Unknown';
        structure.userTypes[userType] = (structure.userTypes[userType] || 0) + 1;
      }

      // Convert Sets to Arrays for JSON serialization
      Object.values(structure.locations).forEach(location => {
        location.departments = Array.from(location.departments);
      });

      // Generate insights
      structure.organizationInsights.topDepartments = Object.values(structure.departments)
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 10)
        .map(dept => ({
          name: dept.name,
          userCount: dept.userCount,
          topTitle: Object.entries(dept.commonTitles)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A'
        }));
        
      structure.organizationInsights.topLocations = Object.values(structure.locations)
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 10)
        .map(loc => ({
          name: loc.name,
          userCount: loc.userCount,
          departmentCount: loc.departments.length
        }));
        
      structure.organizationInsights.userDistribution = structure.userTypes;

      return { success: true, structure };

    } catch (error) {
      console.error('GraphApiClient: Error getting organization structure:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Team Collaboration Insights - Find collaboration patterns and connections
   */
  async getCollaborationInsights(userId, daysBack = 30) {
    try {
      if (!this.capabilities.directory || !this.capabilities.mail) {
        return { success: false, error: 'Directory or Mail API not available' };
      }

      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      const insights = {
        frequentCollaborators: [],
        departmentalConnections: {},
        communicationPatterns: {
          emailsSent: 0,
          emailsReceived: 0,
          meetingsAttended: 0
        },
        networkAnalysis: {
          directConnections: 0,
          secondDegreeConnections: 0,
          crossFunctionalCollaboration: 0
        },
        lastUpdated: new Date().toISOString()
      };

      // Get user's sent emails to find collaboration patterns
      const sentEmailsResult = await this.tokenExtractor.makeGraphApiRequest(
        `/users/${userId}/mailFolders/SentItems/messages?$filter=sentDateTime ge ${since}&$select=toRecipients,ccRecipients,sentDateTime&$top=100`
      );

      if (sentEmailsResult.success) {
        const emails = sentEmailsResult.data.value || [];
        const collaboratorCounts = {};
        
        for (const email of emails) {
          insights.communicationPatterns.emailsSent++;
          
          // Count recipients
          const allRecipients = [...(email.toRecipients || []), ...(email.ccRecipients || [])];
          for (const recipient of allRecipients) {
            const address = recipient.emailAddress?.address;
            if (address && address !== userId) {
              collaboratorCounts[address] = (collaboratorCounts[address] || 0) + 1;
            }
          }
        }
        
        // Get top collaborators and their details
        const topCollaboratorEmails = Object.entries(collaboratorCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([email]) => email);
          
        for (const email of topCollaboratorEmails) {
          try {
            const userResult = await this.tokenExtractor.makeGraphApiRequest(
              `/users/${email}?$select=id,displayName,jobTitle,department`
            );
            
            if (userResult.success) {
              const collaborator = userResult.data;
              insights.frequentCollaborators.push({
                id: collaborator.id,
                name: collaborator.displayName,
                email: email,
                jobTitle: collaborator.jobTitle,
                department: collaborator.department,
                collaborationCount: collaboratorCounts[email]
              });
              
              // Track departmental connections
              if (collaborator.department) {
                insights.departmentalConnections[collaborator.department] = 
                  (insights.departmentalConnections[collaborator.department] || 0) + 1;
              }
            }
          } catch {
            // Skip if user not found
          }
        }
      }

      // Get calendar data for meeting attendance patterns
      if (this.capabilities.calendar) {
        try {
          const calendarResult = await this.tokenExtractor.makeGraphApiRequest(
            `/users/${userId}/calendar/calendarView?startDateTime=${since}&endDateTime=${new Date().toISOString()}&$select=attendees&$top=100`
          );
          
          if (calendarResult.success) {
            const events = calendarResult.data.value || [];
            insights.communicationPatterns.meetingsAttended = events.length;
            
            // Analyze meeting attendee patterns
            for (const event of events) {
              if (event.attendees) {
                insights.networkAnalysis.directConnections += event.attendees.length - 1; // Exclude self
              }
            }
          }
        } catch {
          // Calendar analysis optional
        }
      }

      return { success: true, insights };

    } catch (error) {
      console.error('GraphApiClient: Error getting collaboration insights:', error);
      return { success: false, error: error.message };
    }
  }

  // ============== DIRECTORY UTILITY METHODS ==============

  /**
   * Generate user initials from display name
   */
  generateInitials(displayName) {
    if (!displayName || typeof displayName !== 'string') return 'U';
    
    return displayName
      .split(' ')
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }

  // ============== FILE UTILITY METHODS ==============

  /**
   * Extract file extension from filename
   */
  getFileExtension(filename) {
    if (!filename || typeof filename !== 'string') return 'unknown';
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : 'no-extension';
  }

  /**
   * Format file size in human readable format
   */
  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ============== UTILITY METHODS ==============

  /**
   * Get client status and capabilities
   */
  getStatus() {
    return {
      initialized: this.initialized,
      capabilities: this.capabilities,
      tokenStatus: this.tokenExtractor.getStatus()
    };
  }

  /**
   * Test specific Graph API endpoint
   */
  async testEndpoint(endpoint, options = {}) {
    return await this.tokenExtractor.makeGraphApiRequest(endpoint, options);
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.tokenExtractor) {
      this.tokenExtractor.stopTokenRefresh();
      this.tokenExtractor.clearTokenCache();
    }
    this.initialized = false;
  }
}

module.exports = GraphApiClient;
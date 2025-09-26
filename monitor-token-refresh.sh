#!/bin/bash

# Token Refresh Monitoring Script
# This script monitors the Teams for Linux application for token refresh activity

echo "🔍 Token Refresh Monitoring Started: $(date)"
echo "⏰ Monitoring for 1-hour token refresh cycle..."
echo "📝 Logs will be saved to token-refresh-monitor.log"

# Create log file with timestamp
LOG_FILE="token-refresh-monitor-$(date +%Y%m%d_%H%M%S).log"
echo "Token Refresh Monitor Started: $(date)" > "$LOG_FILE"

# Function to log with timestamp
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_with_timestamp "🚀 Starting monitoring for token refresh functionality..."
log_with_timestamp "📋 Expected sequence:"
log_with_timestamp "   1. Application startup"
log_with_timestamp "   2. Teams page load (did-finish-load event)"  
log_with_timestamp "   3. Token refresh injection"
log_with_timestamp "   4. Configuration setup"
log_with_timestamp "   5. Scheduler start (1-hour intervals)"
log_with_timestamp "   6. First scheduled refresh (after 1 hour)"

# Monitor intervals
CHECK_INTERVAL=60  # Check every minute
HOUR_IN_SECONDS=3600
START_TIME=$(date +%s)

log_with_timestamp "⚡ Monitoring every $CHECK_INTERVAL seconds..."
log_with_timestamp "🎯 Will alert when 1 hour approaches (at 55 minutes)"

# Counter for checks
CHECK_COUNT=0

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    MINUTES_ELAPSED=$((ELAPSED / 60))
    
    CHECK_COUNT=$((CHECK_COUNT + 1))
    
    # Log status every 5 minutes
    if [ $((CHECK_COUNT % 5)) -eq 0 ]; then
        log_with_timestamp "📊 Status Update: $MINUTES_ELAPSED minutes elapsed"
        
        # Check if Teams for Linux is running
        if pgrep -f "teams-for-linux" > /dev/null; then
            log_with_timestamp "✅ Teams for Linux process is running"
        else
            log_with_timestamp "❌ Teams for Linux process not found"
        fi
        
        # Estimate time to first refresh
        MINUTES_REMAINING=$((60 - MINUTES_ELAPSED))
        if [ $MINUTES_REMAINING -gt 0 ]; then
            log_with_timestamp "⏳ Estimated time to first refresh: $MINUTES_REMAINING minutes"
        fi
    fi
    
    # Alert when approaching 1 hour
    if [ $ELAPSED -ge 3300 ] && [ $ELAPSED -lt 3360 ]; then  # 55-56 minutes
        log_with_timestamp "🔔 ALERT: Approaching 1-hour mark! First token refresh should occur soon..."
    fi
    
    # Alert when 1 hour passes
    if [ $ELAPSED -ge $HOUR_IN_SECONDS ] && [ $ELAPSED -lt $((HOUR_IN_SECONDS + 60)) ]; then
        log_with_timestamp "🎯 1 HOUR REACHED! Token refresh should be happening now..."
        log_with_timestamp "👀 Watch for '[TOKEN_REFRESH] Executing scheduled refresh...' in app logs"
    fi
    
    # Continue monitoring for 75 minutes total (to catch the refresh)
    if [ $ELAPSED -gt 4500 ]; then  # 75 minutes
        log_with_timestamp "✅ Monitoring complete. Check app logs for token refresh activity."
        break
    fi
    
    sleep $CHECK_INTERVAL
done

log_with_timestamp "📋 Monitoring session completed"
log_with_timestamp "📄 Full log saved to: $LOG_FILE"

echo ""
echo "🏁 Monitoring completed! Check the log file: $LOG_FILE"
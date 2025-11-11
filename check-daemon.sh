#!/bin/bash

# Healthcheck script for Reachy Mini daemons
# Checks processes, connectivity and daemon state

echo "🔍 Reachy Mini Daemon Healthcheck"
echo "=================================="
echo ""

# 1. Search for daemon processes
echo "📋 Active processes:"
DAEMON_PIDS=$(pgrep -f "reachy.*daemon" 2>/dev/null)

if [ -z "$DAEMON_PIDS" ]; then
    echo "❌ No daemon process found"
    DAEMON_RUNNING=false
    DAEMON_COUNT=0
else
    DAEMON_COUNT=$(echo "$DAEMON_PIDS" | wc -l | tr -d ' ')
    echo "✅ $DAEMON_COUNT process(es) found:"
    
    # List processes with details
    while IFS= read -r pid; do
        CPU=$(ps -p "$pid" -o %cpu= | tr -d ' ')
        MEM=$(ps -p "$pid" -o %mem= | tr -d ' ')
        CMD=$(ps -p "$pid" -o command= | head -c 100)
        
        # Determine if it's an active daemon or zombie
        if (( $(echo "$CPU > 0.1" | bc -l) )); then
            echo "   PID $pid - CPU: ${CPU}% - MEM: ${MEM}% ✅ ACTIVE"
        else
            echo "   PID $pid - CPU: ${CPU}% - MEM: ${MEM}% ⚠️  ZOMBIE (idle)"
        fi
    done <<< "$DAEMON_PIDS"
    
    if [ "$DAEMON_COUNT" -gt 1 ]; then
        echo ""
        echo "⚠️  WARNING: Multiple daemons detected (${DAEMON_COUNT})"
        echo "   → Use 'yarn kill-daemon' to clean up"
    fi
    
    DAEMON_RUNNING=true
fi

echo ""

# 2. Test HTTP connectivity
echo "🌐 HTTP Connectivity (port 8000):"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:8000/api/daemon/status 2>/dev/null)

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Port 8000 accessible (HTTP $HTTP_STATUS)"
    HTTP_OK=true
elif [ "$HTTP_STATUS" = "000" ]; then
    echo "❌ Port 8000 inaccessible (connection refused)"
    HTTP_OK=false
else
    echo "⚠️  Port 8000 responds with HTTP code $HTTP_STATUS"
    HTTP_OK=false
fi

echo ""

# 3. Check daemon state
if [ "$HTTP_OK" = true ]; then
    echo "🤖 Daemon state:"
    DAEMON_STATUS=$(curl -s http://localhost:8000/api/daemon/status 2>/dev/null)
    
    if [ -n "$DAEMON_STATUS" ]; then
        echo "✅ Daemon responds correctly"
        echo "   Response: $DAEMON_STATUS"
    else
        echo "⚠️  Daemon responds but returns empty"
    fi
    
    echo ""
    
    # 4. Check emotions
    echo "😊 Emotions library:"
    EMOTIONS=$(curl -s "http://localhost:8000/api/move/recorded-move-datasets/list/pollen-robotics/reachy-mini-emotions-library" 2>/dev/null)
    
    if [ -n "$EMOTIONS" ]; then
        EMOTION_COUNT=$(echo "$EMOTIONS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null)
        
        if [ -n "$EMOTION_COUNT" ] && [ "$EMOTION_COUNT" -gt 0 ]; then
            echo "✅ $EMOTION_COUNT emotions available"
        else
            echo "⚠️  Library loaded but empty"
        fi
    else
        echo "❌ Emotions library not available"
    fi
    
    echo ""
    
    # 5. Check full state
    echo "📊 Robot full state:"
    FULL_STATE=$(curl -s http://localhost:8000/api/state/full 2>/dev/null)
    
    if [ -n "$FULL_STATE" ]; then
        echo "✅ Full state available"
        # Extract some key info if possible
        echo "$FULL_STATE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'motors' in data:
        print(f'   Motors: {len(data[\"motors\"])} detected')
    if 'control_mode' in data:
        print(f'   Control mode: {data[\"control_mode\"]}')
except:
    pass
" 2>/dev/null
    else
        echo "⚠️  Full state not available"
    fi
else
    echo "⏭️  API tests skipped (daemon not accessible)"
fi

echo ""
echo "=================================="
echo "📝 Summary:"

if [ "$DAEMON_RUNNING" = true ] && [ "$HTTP_OK" = true ]; then
    echo "✅ Daemon HEALTHY - Everything works correctly"
    exit 0
elif [ "$DAEMON_RUNNING" = true ] && [ "$HTTP_OK" = false ]; then
    echo "⚠️  Daemon DEGRADED - Process active but HTTP inaccessible"
    exit 1
elif [ "$DAEMON_RUNNING" = false ] && [ "$HTTP_OK" = true ]; then
    echo "⚠️  INCONSISTENT state - HTTP responds but no process found"
    exit 1
else
    echo "❌ Daemon DOWN - No active daemon"
    exit 2
fi


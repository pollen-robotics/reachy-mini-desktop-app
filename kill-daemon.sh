#!/bin/bash

# Same inclusive pattern as check-daemon.sh
DAEMON_PIDS=$(pgrep -f "reachy.*daemon" 2>/dev/null)
PORT_PIDS=$(lsof -ti:8000 2>/dev/null)

# Combine all unique PIDs
ALL_PIDS=$(echo -e "$DAEMON_PIDS\n$PORT_PIDS" | sort -u | grep -v '^$')

if [ -z "$ALL_PIDS" ]; then
    echo "ℹ️  No daemon running"
else
    COUNT=$(echo "$ALL_PIDS" | wc -l | tr -d " ")
    echo "🔴 Stopping $COUNT daemon(s)..."
    echo "   PIDs: $(echo $ALL_PIDS | tr '\n' ' ')"
    
    # SIGTERM first (graceful)
    echo "$ALL_PIDS" | xargs kill 2>/dev/null || true
    sleep 0.5
    
    # SIGKILL for survivors (brutal)
    echo "$ALL_PIDS" | xargs kill -9 2>/dev/null || true
    
    # Kill by pattern too (double safety)
    pkill -9 -f "reachy.*daemon" 2>/dev/null || true
    
    # Kill everything on port 8000 (triple safety)
    lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
    
    echo "✓ $COUNT daemon(s) terminated 💀"
fi


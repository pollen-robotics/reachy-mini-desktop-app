#!/bin/bash

# Same inclusive pattern as check-daemon.sh
DAEMON_PIDS=$(pgrep -f "reachy.*daemon" 2>/dev/null)
PORT_PIDS=$(lsof -ti:8000 2>/dev/null)

# Also find uv processes that might be related
UV_PIDS=$(pgrep -f "uv.*reachy.*daemon" 2>/dev/null)

# Combine all unique PIDs
ALL_PIDS=$(printf "%s\n%s\n%s\n" "$DAEMON_PIDS" "$PORT_PIDS" "$UV_PIDS" | grep -v '^$' | sort -u)

if [ -z "$ALL_PIDS" ]; then
    echo "ℹ️  No daemon running"
else
    COUNT=$(echo "$ALL_PIDS" | wc -l | tr -d " ")
    echo "🔴 Stopping $COUNT daemon(s)..."
    echo "   PIDs: $(echo "$ALL_PIDS" | tr '\n' ' ')"
    
    # SIGTERM first (graceful) - kill each PID individually
    for pid in $ALL_PIDS; do
        kill "$pid" 2>/dev/null || true
    done
    
    sleep 1
    
    # SIGKILL for survivors (brutal) - kill each PID individually with multiple attempts
    for pid in $ALL_PIDS; do
        # Try multiple times for stuck processes
        for attempt in 1 2 3; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
                sleep 0.2
            else
                break
            fi
        done
    done
    
    # Kill by pattern too (double safety) - kill all uv processes related to reachy
    pkill -9 -f "uv.*reachy.*daemon" 2>&1 | grep -v "No matching processes" || true
    pkill -9 -f "reachy.*daemon" 2>&1 | grep -v "No matching processes" || true
    
    # Kill everything on port 8000 (triple safety)
    lsof -ti:8000 2>/dev/null | while read pid; do
        kill -9 "$pid" 2>/dev/null || true
    done
    
    # Final check - kill remaining uv processes individually
    sleep 0.5
    REMAINING=$(pgrep -f "reachy.*daemon" 2>/dev/null)
    UV_REMAINING=$(pgrep -f "uv.*reachy.*daemon" 2>/dev/null)
    REMAINING=$(printf "%s\n%s\n" "$REMAINING" "$UV_REMAINING" | grep -v '^$' | sort -u)
    if [ -n "$REMAINING" ]; then
        echo "⚠️  Some processes may be stuck. Trying additional cleanup..."
        for pid in $REMAINING; do
            # Try killall for specific process name if it's a uv process
            PROC_NAME=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ')
            if [ "$PROC_NAME" = "uv" ] || [ "$PROC_NAME" = "./uv" ]; then
                # Try to kill by process name and arguments
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    # Final verification - check for stuck processes
    sleep 0.5
    STILL_RUNNING=$(pgrep -f "reachy.*daemon" 2>/dev/null)
    UV_STILL_RUNNING=$(pgrep -f "uv.*reachy.*daemon" 2>/dev/null)
    STILL_RUNNING=$(printf "%s\n%s\n" "$STILL_RUNNING" "$UV_STILL_RUNNING" | grep -v '^$' | sort -u)
    if [ -n "$STILL_RUNNING" ]; then
        STUCK_COUNT=0
        STUCK_PIDS=""
        for pid in $STILL_RUNNING; do
            STAT=$(ps -p "$pid" -o stat= 2>/dev/null | tr -d ' ')
            if [[ "$STAT" == "UE" ]] || [[ "$STAT" =~ ^.*U.*$ ]]; then
                STUCK_COUNT=$((STUCK_COUNT + 1))
                STUCK_PIDS="$STUCK_PIDS $pid"
            fi
        done
        
        if [ "$STUCK_COUNT" -gt 0 ]; then
            echo "⚠️  Warning: $STUCK_COUNT process(es) are stuck in uninterruptible wait state (UE)"
            echo "   Stuck PIDs:$STUCK_PIDS"
            echo "   These processes cannot be killed - they are blocked in kernel calls"
            echo "   They will be cleaned up automatically when the kernel call completes"
            echo "   Or you may need to restart your system"
        else
            REMAINING_COUNT=$(echo "$STILL_RUNNING" | wc -l | tr -d " ")
            echo "⚠️  Warning: $REMAINING_COUNT process(es) may still be running"
        fi
    else
        echo "✓ $COUNT daemon(s) terminated 💀"
    fi
fi


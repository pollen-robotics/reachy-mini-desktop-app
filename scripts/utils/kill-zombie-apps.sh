#!/bin/bash

# Kill zombie Reachy Mini apps
# Identifies and kills orphaned Python processes from the daemon

set -e

echo "🔍 Searching for zombie Reachy Mini apps..."
echo ""

# Patterns to search for (apps launched by the daemon)
PATTERNS=(
  "reachy_mini.*app.*main"           # Any reachy_mini app
  "reachy_mini_conversation_app"     # Conversation app
  "reachy_mini.*_venv.*python"       # Python in app venvs
  "multiprocessing.resource_tracker" # Orphaned multiprocessing trackers
)

# Build the grep pattern
GREP_PATTERN=$(IFS="|"; echo "${PATTERNS[*]}")

# Find matching processes (excluding grep itself and this script)
ZOMBIE_PIDS=()
ZOMBIE_INFO=()

while IFS= read -r line; do
  if [[ -n "$line" ]]; then
    PID=$(echo "$line" | awk '{print $2}')
    CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf $i" "; print ""}')
    ZOMBIE_PIDS+=("$PID")
    ZOMBIE_INFO+=("$line")
  fi
done < <(ps aux | grep -E "$GREP_PATTERN" | grep -v grep | grep -v "kill-zombie-apps")

# Report findings
if [ ${#ZOMBIE_PIDS[@]} -eq 0 ]; then
  echo "✅ No zombie apps found!"
  exit 0
fi

echo "⚠️  Found ${#ZOMBIE_PIDS[@]} zombie process(es):"
echo ""
echo "  PID     CPU%   MEM%   COMMAND"
echo "  ─────────────────────────────────────────────────────────────────"

for info in "${ZOMBIE_INFO[@]}"; do
  PID=$(echo "$info" | awk '{print $2}')
  CPU=$(echo "$info" | awk '{print $3}')
  MEM=$(echo "$info" | awk '{print $4}')
  CMD=$(echo "$info" | awk '{for(i=11;i<=NF;i++) printf $i" "; print ""}' | cut -c1-50)
  printf "  %-7s %-6s %-6s %s\n" "$PID" "$CPU%" "$MEM%" "$CMD"
done

echo ""

# Ask for confirmation unless --force flag is passed
if [[ "$1" != "--force" && "$1" != "-f" ]]; then
  read -p "🗑️  Kill these processes? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted."
    exit 1
  fi
fi

# Kill the processes
echo ""
echo "💀 Killing zombie processes..."

for pid in "${ZOMBIE_PIDS[@]}"; do
  if kill -9 "$pid" 2>/dev/null; then
    echo "  ✅ Killed PID $pid"
  else
    echo "  ⚠️  Could not kill PID $pid (already dead?)"
  fi
done

echo ""
echo "✅ Done! Zombie apps have been terminated."
echo ""
echo "💡 If audio warnings persist, restart the Tauri app."


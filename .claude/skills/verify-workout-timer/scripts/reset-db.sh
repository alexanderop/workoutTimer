#!/usr/bin/env bash
# Wipe the local database and land on a clean home screen.
# Dexie holds the connection open, so the delete fires `blocked` and only
# completes once the reload drops it — the reload is part of the recipe.
# Usage: .claude/skills/verify-workout-timer/scripts/reset-db.sh [session-name] [url]
set -euo pipefail

SESSION="${1:-wt}"
URL="${2:-http://localhost:5173}"
AB=(agent-browser --session-name "$SESSION")

# `reload` keeps whatever route you were on, so go home first.
"${AB[@]}" open "$URL/" >/dev/null
"${AB[@]}" eval --stdin >/dev/null <<'JS'
(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('workout-timer')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  return 'deleted'
})()
JS
"${AB[@]}" reload >/dev/null
"${AB[@]}" wait --text "Choose a format"
echo "reset: database dropped, home screen up"

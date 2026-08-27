#!/usr/bin/env bash
# Read-only: is this instance worth driving?
# Usage: .claude/skills/verify-workout-timer/scripts/doctor.sh [session-name] [url]
set -uo pipefail

SESSION="${1:-wt}"
URL="${2:-http://localhost:5173}"
AB=(agent-browser --session-name "$SESSION")

status=$(curl -s -o /dev/null -w '%{http_code}' "$URL/" 2>/dev/null || echo 000)
echo "server        $URL -> $status"
if [ "$status" != "200" ]; then
  echo "              not serving; start it with: pnpm dev"
  exit 1
fi

echo "browser url   $("${AB[@]}" get url 2>&1 | tail -1)"
echo "app mounted   $("${AB[@]}" eval 'document.querySelector("[data-testid=app]") !== null' 2>&1 | tail -1)"

"${AB[@]}" eval --stdin <<'JS' 2>&1 | sed 's/^/rows          /'
(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('workout-timer')
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const count = (store) => new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).count()
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const [sessions, presets, timerSettings] = await Promise.all(
    ['sessions', 'presets', 'timerSettings'].map(count),
  )
  return { dbVersion: db.version, sessions, presets, timerSettings }
})()
JS

errors=$("${AB[@]}" errors 2>&1)
if [ -z "$errors" ]; then
  echo "page errors   none"
else
  echo "page errors   $errors"
fi

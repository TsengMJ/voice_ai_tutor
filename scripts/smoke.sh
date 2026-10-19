#!/usr/bin/env bash
# End-to-end smoke test against a running stack (docker compose up).
# Exercises the HTTP surface through the web container's /api proxy.
# Does not need real LiveKit/Gemini keys; it never opens a media connection.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:${WEB_PORT:-3000}}"
JAR="$(mktemp)"
OTHER_JAR="$(mktemp)"
trap 'rm -f "$JAR" "$OTHER_JAR"' EXIT

pass=0
check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf '  \033[32m✓\033[0m %s\n' "$name"
    pass=$((pass + 1))
  else
    printf '  \033[31m✗\033[0m %s (expected %s, got %s)\n' "$name" "$expected" "$actual"
    exit 1
  fi
}

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
json() { curl -s -b "$JAR" -c "$JAR" -H 'content-type: application/json' "$@"; }
js() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);const v=($1);console.log(typeof v==='object'?JSON.stringify(v):v)})"; }
field() { js "d$1"; }

echo "Smoke testing $BASE"

check "web serves the app" 200 "$(status "$BASE/")"
check "SPA fallback for deep links" 200 "$(status "$BASE/practice/anything")"
header() { curl -sI "$1" | tr -d '\r' | grep -i "^$2:" >/dev/null && echo yes || echo no; }
check "pages send a CSP" yes "$(header "$BASE/" content-security-policy)"
check "pages deny framing" yes "$(header "$BASE/" x-frame-options)"
check "api responses carry security headers" yes "$(header "$BASE/api/health" x-content-type-options)"
check "api health" 200 "$(status "$BASE/api/health")"

check "catalog lists 3 scenarios" 3 "$(json "$BASE/api/scenarios" | field '.scenarios.length')"
check "catalog is public (no identity issued)" false "$(grep -q tutor_lid "$JAR" && echo true || echo false)"
DASH="$(json "$BASE/api/dashboard?tz=UTC")"
check "learner cookie is issued" true "$(grep -q tutor_lid "$JAR" && echo true || echo false)"
check "new learner has sample history only when labeled demo" true \
  "$(echo "$DASH" | js 'd.isDemo === (d.totals.sessions > 0)')"

SESSION="$(json -X POST "$BASE/api/sessions" -d '{"scenarioId":"coffee-order","language":"es","mode":"text","timezone":"UTC"}')"
ID="$(echo "$SESSION" | field '.id')"
check "session created as active" active "$(echo "$SESSION" | field '.status')"

CONN="$(json -X POST "$BASE/api/sessions/$ID/connection" -d '{"mode":"voice"}')"
check "connection returns a room token" true "$(echo "$CONN" | field '.token.split(".").length===3')"
check "room is scoped to the session" true "$(echo "$CONN" | field ".roomName.startsWith('tutor-$ID')")"

check "other learners cannot read the session" 404 "$(status -c "$OTHER_JAR" "$BASE/api/sessions/$ID")"
check "malformed id is a 404" 404 "$(status -b "$JAR" "$BASE/api/sessions/not-a-uuid")"
check "unknown scenario is rejected" 400 \
  "$(status -b "$JAR" -H 'content-type: application/json' -X POST "$BASE/api/sessions" -d '{"scenarioId":"nope","language":"es"}')"

ENDED="$(json -X POST "$BASE/api/sessions/$ID/end")"
check "ending returns the review" ended "$(echo "$ENDED" | field '.session.status')"
check "review has a summary" true "$(echo "$ENDED" | field '.summary!==null')"
check "ended session refuses new connections" 409 \
  "$(status -b "$JAR" -H 'content-type: application/json' -X POST "$BASE/api/sessions/$ID/connection" -d '{"mode":"text"}')"
check "review is readable after ending" ended "$(json "$BASE/api/sessions/$ID" | field '.session.status')"

echo "All $pass checks passed."

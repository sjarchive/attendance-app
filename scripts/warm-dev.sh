#!/usr/bin/env bash
# Dev warm-up: hit every route once so Turbopack compiles it up front,
# instead of on the user's first click. Run AFTER the dev server is ready.
# Usage: scripts/warm-dev.sh [base-url]
set -u
BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"

# 1) Log in as the demo admin (gives us a session cookie for protected APIs)
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@dept.edu","password":"admin123"}')
echo "login: $code"

# 2) Grab a real courseId for the per-course routes
CID=$(curl -s -b "$JAR" "$BASE/api/courses" | python3 -c "import json,sys;print(json.load(sys.stdin)['courses'][0]['id'])" 2>/dev/null || true)

# 3) Warm GET routes (401 responses still compile the module, so no auth needed
#    for the ones that fail — but with the cookie they exercise the real path)
for p in "/" "/api/boot" "/api/auth/me" "/api/courses" "/api/audit?limit=20" \
         "/api/programs" "/api/professors" "/api/student-accounts"; do
  curl -s -b "$JAR" -o /dev/null -w "GET $p -> %{http_code}\n" "$BASE$p"
done

# 4) Per-course routes (roster load + report)
if [ -n "${CID:-}" ]; then
  curl -s -b "$JAR" -o /dev/null -w "GET /api/attendance -> %{http_code}\n" \
    "$BASE/api/attendance?courseId=$CID&date=$(date +%F)"
  curl -s -b "$JAR" -o /dev/null -w "GET /api/reports -> %{http_code}\n" \
    "$BASE/api/reports?courseId=$CID"
fi

# 5) Compile the POST handlers with invalid bodies (400 = compiled, no writes)
curl -s -b "$JAR" -X POST "$BASE/api/attendance" -H 'Content-Type: application/json' \
  -d '{}' -o /dev/null -w "POST /api/attendance (compile only) -> %{http_code}\n"

# 6) Student read-only home (separate module: /api/me/attendance)
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"bed1-01@student.dept.edu","password":"BED1-01"}')
curl -s -b "$JAR" -o /dev/null -w "GET /api/me/attendance -> %{http_code}\n" "$BASE/api/me/attendance"

rm -f "$JAR"
echo "warm-up complete"

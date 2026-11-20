#!/usr/bin/env bash
# One-command full restore of the attendance-app sandbox (PROJECT_CONTEXT.md §12 Step 1).
#
# Usage:
#   GH_TOKEN=<gh-pat> DATABASE_URL="<neon-url>" bash scripts/restore.sh   # full reset case
#   bash scripts/restore.sh                                               # reuse existing .env
#
# Secrets come ONLY from env/args — never hardcode them here (this file is committed).
# Idempotent: every step is skipped when its result already exists, so it is safe to
# re-run on a working tree (it will effectively just restart the dev server + warm up).

set -euo pipefail

PROJ=/home/z/my-project
REPO_URL=https://github.com/sjarchive/attendance-app
GH_TOKEN="${GH_TOKEN:-}"
DATABASE_URL="${DATABASE_URL:-}"

log() { echo "[restore] $*"; }
die() { echo "[restore] ERROR: $*" >&2; exit 1; }

cd "$PROJ"

# ---------- Detect state ----------
NEED_CLONE=1
if [ -d src ] && [ -d prisma ] && git rev-parse --verify HEAD >/dev/null 2>&1; then
  NEED_CLONE=0
  log "repo present (HEAD: $(git log --oneline -1)) — skipping clone/adopt"
else
  log "repo missing or bare template — full restore"
fi

# ---------- Step 1: clone + adopt (reset case only) ----------
if [ "$NEED_CLONE" = "1" ]; then
  [ -n "$GH_TOKEN" ] || die "GH_TOKEN required when the repo is missing"
  rm -rf /tmp/attendance-app
  git clone --depth 5 "https://x-access-token:${GH_TOKEN}@github.com/sjarchive/attendance-app" /tmp/attendance-app
  rm -rf .git src prisma public
  cp -a /tmp/attendance-app/.git .git
  rsync -a --exclude='.git' /tmp/attendance-app/ ./
  git remote set-url origin "$REPO_URL"   # strip token NOW
  log "adopted repo at $(git log --oneline -1)"
  log "spot-check: $(ls src/components/attendance | wc -l) attendance components (expect 11)"
fi

# ---------- Step 2: .env ----------
if [ -n "$DATABASE_URL" ]; then
  printf 'DATABASE_URL=%s\n' "$DATABASE_URL" > .env
  log ".env written (DATABASE_URL provided on the command line)"
elif [ -s .env ]; then
  log ".env already exists — keeping it"
else
  die "no DATABASE_URL given and no existing .env"
fi
git check-ignore -q .env || die ".env is NOT gitignored — aborting"

# ---------- Step 3: deps ----------
if [ -d node_modules ]; then
  log "node_modules present — skipping bun install"
else
  bun install
fi
bunx prisma generate >/dev/null 2>&1
log "prisma client generated"

# ---------- Step 4: dev server (double-fork; survives the tool-call boundary) ----------
DBURL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)"
[ -n "$DBURL" ] || die ".env has no DATABASE_URL"
pkill -f "next dev" 2>/dev/null || true
pkill -f next-server 2>/dev/null || true
sleep 1
( setsid env DATABASE_URL="$DBURL" bun run dev >/dev/null 2>&1 & )
log "dev server launched (double-fork); waiting for it to come up..."
for i in $(seq 1 15); do
  sleep 2
  CODE="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ || true)"
  [ "$CODE" = "200" ] && break
done
[ "$CODE" = "200" ] || { tail -20 dev.log 2>/dev/null || true; die "dev server did not return 200"; }
log "local:200"

# ---------- Warm-up: precompile routes so first clicks are fast ----------
bash scripts/warm-dev.sh | tail -1

# ---------- Summary ----------
log "restore complete: HEAD=$(git rev-parse --short HEAD)  dirty files: $(git status --short | wc -l)"
log "next: PROJECT_CONTEXT.md §12 Step 5 (browser golden path) — nothing else"

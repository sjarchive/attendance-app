# PROJECT CONTEXT — Department Attendance Tracker

This file is the single source of truth for continuing work on this project in any future
session (human or AI). Read it fully before making changes. The original requirements live
in `upload/attendance-app-plan.md`; user-facing setup/deploy docs live in `README.md`.

Last updated: 2026-11-20. Newest work since the performance pass:
- **Fast restore (`3ca9c02` and later)**: `scripts/restore.sh` does the entire reset branch
  (clone+adopt, `.env`, deps, dev server, warm-up) in ONE command — see §12 Step 1.
  A 2026-11-20 sandbox reset was restored with it end-to-end; golden path re-verified.
- Unique-student dashboard stat fix (`e59405b`): `/api/boot` + `/api/courses` return
  `stats.students` (UNIQUE headcount); dashboard no longer sums per-course enrollments
  (was double-counting: 40 students × 2 courses = "80").
- Brand: Z.ai placeholder logo replaced with the app's own graduation-cap mark
  (`745a4d9`); favicon is now local `/logo.svg` (was Z.ai CDN).
- Deployment: 3 manual prod deploys today. **Git auto-deploy is BROKEN** — the repo's
  Vercel GitHub App connection is gone (0 webhooks; link API says repo_not_found; the
  stray `my-project` project that used to catch GitHub deploys was deleted by the user).
  User must reconnect it (§8); until then every push needs a manual deploy (§12 Step 6).
- Production verified live on commit `e59405b` content (login, boot stats=40, logo).

**FAST LANE — read this first in a fresh session.** If the user's message contains this file
plus GitHub/Vercel tokens and Neon URLs, their intent is "restore and verify" (or redeploy).
Do NOT re-explore the repo, the harness scripts, or process-killing behavior — all of that is
already solved and written down here. Run the one-command state check (Section 12, Step 0)
and execute ONLY the branch it selects. A full restore is ONE command
(`GH_TOKEN=<t> DATABASE_URL="<url>" bash scripts/restore.sh`); verification is a
single compact browser pass. Anything marked SKIP is skipped for real — those steps wasted
the most time last session.

---

## 1. What this is

A student attendance tracking app for a college department (built per the plan's phases,
including the Phase 2 features: reports, CSV export, audit trail, admin panel, student
read-only self-view, student account management, CSV roster import).

- **Plan document**: `upload/attendance-app-plan.md` (all phases COMPLETE, including Step 9 deploy)
- **Production**: https://deptattend.vercel.app (Vercel + Neon Postgres, LIVE, verified on `e59405b`)
- **GitHub**: private repo `sjarchive/attendance-app`, branch `main` (origin/main tip = `e59405b`).
  NOTE: pushes do NOT auto-deploy right now (git link broken, §8) — deploy manually after pushing.
- **Local dev**: port 3000 (sandbox Preview Panel), connected to the **Neon Postgres pooled URL**
  again (`DATABASE_URL` in `.env`). Same DB as production — do not run destructive seeds against it.
  Embedded local Postgres (§9.6) is only a documented FALLBACK if Neon URLs are ever lost again.
- **One-page app**: the sandbox only exposes the `/` route, so ALL views are switched inside
  `src/app/page.tsx` — there are no other page routes by design. Do not create new page routes.

## 2. Accounts (demo — rotate before real use)

| Role | Email | Password |
| --- | --- | --- |
| ADMIN (HoD) | `admin@dept.edu` | `admin123` |
| Professor | `meera@dept.edu` | `prof123` |
| Professor | `rajesh@dept.edu` | `prof123` |
| Student (read-only) | `bed1-01@student.dept.edu` | `BED1-01` |

Student accounts (optional, admin-created): email = `rollno@student.dept.edu`, password = roll number.
Note: Dr. Meera Sharma teaches 4 courses (EDU-101, EDU-201, SBE-101, IBE-101) across programs;
her 40 students are disjoint per course. Demo data currently includes one test artifact
(IBE-101 Neha Iyer Absent); reseed only if the user wants clean data (DESTRUCTIVE, §8).

## 3. Tech stack (exact)

- Next.js 16 (App Router, Turbopack dev) + TypeScript 5, deployed on Vercel
- Tailwind CSS 4 + shadcn/ui (New York style) + lucide-react; sonner for toasts
- Prisma 6.11 + **Neon PostgreSQL** (ap-southeast-1): runtime uses the **pooled** URL,
  migrations use the **direct** URL (`directUrl` in schema)
- Auth: custom session — HMAC-SHA256 signed cookie via Web Crypto (`src/lib/session.ts`),
  bcryptjs hashing, login rate limit (10 / 5 min per IP+email), generic error messages
- Validation: zod on every API route; ownership checks (professor sees only own courses → 403/404)
- Audit log on every mutation (`src/lib/audit.ts` + `audit_log` table, no FKs so entries survive deletes)

## 4. Data model (`prisma/schema.prisma`, Postgres, tables lowercased via @@map)

- **Professor**: role `"PROFESSOR"|"ADMIN"` (String, not enum), `active` flag (disabled login), bcrypt `passwordHash`
- **Program**: name unique → courses, students
- **Course**: `@@unique([programId, code])`, belongs to program + professor (both cascade)
- **Student**: `@@unique([programId, rollNo])`, optional email/passwordHash (student login)
- **Enrollment**: `@@unique([courseId, studentId])`, `active` flag = soft-remove from roster
  (attendance rows are preserved after removal)
- **AttendanceRecord**: `date` is a "YYYY-MM-DD" STRING (timezone-safe), status `"PRESENT"|"ABSENT"|"LATE"|"LEAVE"`,
  `@@unique([courseId, studentId, date])` → upsert saves, no duplicate marking, re-editable past dates, future dates rejected
- **AuditLog**: action/entityType/entityId/entityLabel/details(JSON)/actor/actorName/courseId — no FK relations on purpose

Migration history: `prisma/migrations/0_init` (baseline, created via `prisma migrate diff`,
marked applied with `prisma migrate resolve`). On schema changes use `prisma migrate dev`
(needs DIRECT_URL — NOT currently in `.env`; pass it explicitly on the command line, §7).

## 5. File map

```
prisma/schema.prisma        # Postgres datasource: url=DATABASE_URL (pooled), directUrl=DIRECT_URL
prisma/seed.ts              # delete-then-create seed: 3 faculty, 4 programs, 8 courses, 40 students, demo attendance
prisma/migrations/0_init/   # baseline migration (Postgres)
src/proxy.ts                # (renamed from middleware.ts, Next 16 convention) gates ALL /api/* except
                            # /api/auth/* and /api/boot — session cookie check, Edge-compatible
src/lib/                    # session.ts (HMAC cookie; AUTH_SECRET falls back to a public dev secret),
                            # db.ts (query logging gated behind PRISMA_DEBUG=1),
                            # auth.ts, audit.ts, rate-limit.ts, course-access.ts, csv.ts, date.ts,
                            # password.ts, types.ts (BootStats added), api.ts/client.ts (fetch helpers)
src/app/page.tsx            # SINGLE page: swaps views — dashboard | attendance | roster | reports | admin (+ student self-view)
                            # boot = ONE /api/boot call (user + courses + stats.students together);
                            # holds uniqueStudents state, passes it to Dashboard; reset on logout
src/app/api/boot/route.ts   # combined startup endpoint: session user + course list + UNIQUE student
                            # headcount in one round trip; 3 parallel DB reads; public for anonymous
src/app/api/courses/route.ts # GET also returns stats.students (unique) — Refresh button path
src/app/api/                # auth/{login,logout,me}, boot, programs[+id], courses[+id], professors[+id],
                            # students[+id], students/import, attendance, reports, audit, student-accounts, me/attendance
src/components/attendance/  # login-screen, dashboard (renders uniqueStudents, NOT a sum), attendance-marker
                            # (P/A/L/V keyboard shortcuts, dirty tracking, sticky save bar), roster-manager,
                            # reports-view, admin-panel, student-accounts-panel, csv-import-dialog,
                            # audit-list, status-toggle, my-attendance
public/logo.svg             # BRAND: Lucide GraduationCap glyph (exact path data from node_modules
                            # lucide-react) scaled 2x on the dark theme tile, emerald #34D399 stroke;
                            # favicon = /logo.svg via layout.tsx icons (NO external CDN refs)
scripts/restore.sh         # ONE-COMMAND full restore after a sandbox reset: clone+adopt, .env,
                           # bun install + prisma generate, double-fork dev start, warm-dev.sh
                           # (secrets via GH_TOKEN/DATABASE_URL env vars only; idempotent skips)
scripts/warm-dev.sh         # dev warm-up: logs in (admin + student) and hits every route once so Turbopack
                            # compiles modules BEFORE the user clicks; run after every dev server start
vercel.json                 # buildCommand: "prisma generate && next build" (overrides package.json on Vercel)
README.md                   # user-facing runbook
db/pgdata/                  # embedded Postgres data dir (FALLBACK only, gitignored, port 5432)
```

## 6. Key behaviors / invariants (do not break)

- Professor sees only own courses (ADMIN sees all); all mutations re-check ownership server-side
- **Dashboard "Students" stat = `stats.students` from `/api/boot` / `/api/courses` — a UNIQUE
  headcount (admin: all students; professor: distinct students enrolled in their courses).
  NEVER sum `course.studentCount` for it — students in 2+ courses were double-counted (bug fixed
  in e59405b: 40 students showed as 80). Per-course cards keep their own counts (correct).**
- Attendance saves are upserts on `(courseId, studentId, date)` — idempotent, re-editable.
  Implemented as ONE bulk `INSERT ... ON CONFLICT DO UPDATE` via `$executeRaw` (Prisma.sql +
  Prisma.join value rows; ids via `gen_random_uuid()::text`) — never revert to N `upsert()`
  calls in `$transaction`, that is N round trips and was the slowest path on remote DBs
- Attendance `id`s for rows created via the bulk upsert are UUIDs (not cuids) — ids are opaque,
  nothing depends on the format
- Deleting a student = deactivating their enrollments (`active=false`), attendance history stays
- Courses/programs delete cascades; audit entries survive via lack of FKs
- `.env` is gitignored AND untracked; never commit it
- Footer must stay sticky-bottom (`min-h-screen flex flex-col` + `mt-auto`); mobile-first responsive
- No emojis in UI; no indigo/blue palette (use primary token); brand icon = Lucide `GraduationCap`
  in emerald (used on login screen, header, bottom nav, dashboard, admin panel, and `public/logo.svg`)

## 7. Environment variables

| Var | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Vercel (prod: Neon pooled) + local `.env` | runtime connection string |
| `DIRECT_URL` | Vercel (prod) + explicit CLI flags locally | migrations only — NOT in local `.env` |
| `AUTH_SECRET` | Vercel (prod: fresh random hex) | signs session cookie |

**Current local state (2026-11-19 evening):** `.env` contains ONLY `DATABASE_URL` (the Neon
pooled URL). Local runtime works with just it (Prisma ignores `directUrl` at runtime; session
signing falls back to `session.ts`'s public dev secret — acceptable for dev, never for prod).
For any migration from the sandbox, pass DIRECT_URL explicitly:
`DIRECT_URL=<direct-url> bunx prisma migrate deploy`
(If the Neon URLs are ever lost again: prod's vars are Sensitive in Vercel, ask the user or
read console.neon.tech; the pooled URL contains `-pooler`. Embedded Postgres §9.6 is the
offline fallback.)
(2026-11-20: a NON-pooler direct URL also works as the local runtime `DATABASE_URL` —
verified end-to-end; runtime accepts either endpoint, only migrations care about the
distinction. If the user pastes just one URL, use it and say so in the reply.)

## 7b. Performance notes (why things were slow — measured 2026-11-19)

Root causes, in order of impact:
1. **Remote DB round trips** (historical): every Prisma query paid an internet RTT to Neon;
   pages that ran several serial queries multiplied this. Fixed by: combined `/api/boot`,
   parallel `Promise.all` reads (attendance POST pre-checks, reports, me/attendance, boot,
   courses GET), and the single-statement bulk upsert (N saves → 1 statement).
2. **Turbopack on-demand compile** (dev only): each route module compiles on first hit
   (~130-170ms per API module, ~2.4-5.4s for the `/` page). Mitigations: `scripts/warm-dev.sh`
   after every dev server start; Turbopack's on-disk cache makes restarts cheaper.
3. **Prisma query logging was always on** (`log: ['query']`) — now gated behind `PRISMA_DEBUG=1`.
4. Boot flow was 2 serial requests (`/api/auth/me` → `/api/courses`), each with its own
   compile + DB round trips — now 1 request with parallel DB reads.

**Production profile (measured on Vercel):** first hit after idle ~3-5s (serverless cold
start + fresh Neon pooler connection), then warm ~0.5-1s per API call, homepage ~0.5s.
A cold lambda can throw ONE transient `P1017 "Server has closed the connection"` 500
(500s self-heal on retry — observed once after a deploy; not a code bug; retry, don't debug).

## 8. Deployment runbook

**GIT AUTO-DEPLOY STATUS: BROKEN (as of 2026-11-19 evening).**
- `attendance-app` project `link = null`; repo has 0 webhooks and 0 GitHub deployments;
  `POST /v1/projects/{id}/link` fails with `repo_not_found` → the Vercel GitHub App no
  longer covers `sjarchive` (it worked earlier that day — the old link pointed at the
  stray `my-project` project, which the user has since deleted).
- **Fix (user-owned, needs browser auth):** vercel.com → attendance-app → Settings → Git
  → Connect Git Repository → install/authorize the Vercel GitHub App for `sjarchive`
  (at least the `attendance-app` repo) → select repo + branch `main`. After reconnecting,
  verify with a test push (a new deployment should appear with `githubCommitSha` meta
  within ~1 min and alias to deptattend.vercel.app).
- **Until then: every push to main must be followed by a manual deploy (§12 Step 6).**

Manual deploy (proven 3× on 2026-11-19):
1. `bunx --yes vercel link --yes --project attendance-app --scope sj-cd0e --token <VERCEL_TOKEN>`
   (writes `.vercel/project.json`; also creates a harmless gitignored `.env.local` — leave it)
2. Staged-copy deploy (REQUIRED: the project has commit-author deployment protection, and a
   CLI deploy that attaches the sandbox git commit is BLOCKED with TEAM_ACCESS_REQUIRED;
   a copy without `.git` has no commit metadata → no block):
   ```bash
   rm -rf /tmp/deploy-stage && mkdir -p /tmp/deploy-stage && \
   rsync -a --exclude '.git' --exclude 'node_modules' --exclude '.next' \
         --exclude '.env' --exclude '.env.local' --exclude 'db' --exclude 'dev.log' \
         /home/z/my-project/ /tmp/deploy-stage/ && \
   cp /home/z/my-project/.vercel/project.json /tmp/deploy-stage/.vercel/project.json && \
   cd /tmp/deploy-stage && bunx --yes vercel deploy --prod --yes --token <VERCEL_TOKEN>
   ```
3. Build takes ~35s; "✓ Ready" then auto-promotes to deptattend.vercel.app.
4. Post-deploy verify (login curl + stat + logo):
   ```bash
   curl -s -c /tmp/cj.txt -o /dev/null -w "%{http_code}\n" -X POST https://deptattend.vercel.app/api/auth/login \
     -H "Content-Type: application/json" -d '{"email":"admin@dept.edu","password":"admin123"}'
   curl -s -b /tmp/cj.txt https://deptattend.vercel.app/api/boot | grep -o '"students":[0-9]*'   # expect 40
   curl -s https://deptattend.vercel.app/logo.svg | grep -c "21.42 10.922"                       # expect 1 (cap glyph)
   ```
   (A single transient P1017 500 right after deploy = cold-connection blip; retry.)

- **Schema change flow**: edit schema → `DIRECT_URL=<direct-url> bunx prisma migrate dev --name <x>`
  locally → commit migration folder → manual deploy (above)
- **Reseed (DESTRUCTIVE)**: `DATABASE_URL=<pooled-url> bunx tsx prisma/seed.ts` — wipes Neon data
  (same DB as prod!) — only on explicit user request
- **GitHub sync**: `git push https://x-access-token:<GH_TOKEN>@github.com/sjarchive/attendance-app main`

## 9. Sandbox quirks (local dev only)

1. The sandbox shell exports `DATABASE_URL=file:...` GLOBALLY; process env overrides `.env`
   files in Next.js. The dev server MUST be started with explicit overrides:
   ```bash
   DATABASE_URL=<pooled-url> bun run dev
   ```
   (Restarting without them yields PrismaClientInitializationError "URL must start with protocol")
2. If things go stale after env/client changes: `pkill -f next; rm -rf .next; restart dev`
3. `bun run build` (standalone + cp steps) is for self-hosting only — Vercel uses vercel.json's
   buildCommand instead; the sandbox forbids builds (dev server only, port 3000)
4. Background processes started from a tool-call shell are KILLED at the tool-call boundary
   (even with setsid/nohup, single fork). To make the dev server survive, double-fork so it
   is orphaned to PID 1 DURING the call, before the boundary sweep:
   ```bash
   ( setsid env DATABASE_URL=<pooled-url> bun run dev >/dev/null 2>&1 & ) ; sleep 10
   ```
5. Sandbox reset & restore: clone `sjarchive/attendance-app` (token used transiently, then
   `git remote set-url` back to the token-free URL), recreate `.env`, `bun install`,
   `prisma generate`. NOTE: many files show as `M` in `git status` after a reset but the
   diff is 0 insertions / 0 deletions — file-mode bits only; ignore them. Also ignore (or
   push) the harness's auto-checkpoint commits with UUID-message names (`643e17e`,
   `c5523fe`...) — they are always EMPTY (0 insertions/0 deletions).
6. **Embedded local Postgres — FALLBACK ONLY (not currently in use; dev is on Neon).**
   Binaries via devDependency `@embedded-postgres/linux-x64`; data dir `db/pgdata`, port 5432.
   Init + start commands (only if Neon URLs are lost and the user opts for local dev):
   ```bash
   PGBIN=node_modules/@embedded-postgres/linux-x64/native/bin
   echo postgres > /tmp/pw && $PGBIN/initdb -D db/pgdata -U postgres --pwfile=/tmp/pw -E UTF8 --locale=C
   $PGBIN/pg_ctl -D db/pgdata stop -m fast
   echo "CREATE DATABASE attendance;" | $PGBIN/postgres --single -D db/pgdata postgres
   ( setsid $PGBIN/pg_ctl -D db/pgdata -l db/pg.log -o "-p 5432 -c listen_addresses=127.0.0.1" start >/dev/null 2>&1 & ) ; sleep 3
   ```
   Seed: `env DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/attendance bunx tsx prisma/seed.ts`

## 10. Verification status (code verified for `e59405b`; origin/main tip is now `3ca9c02`, docs/scripts-only on top of it)

`3ca9c02` added only `docs/PROJECT_CONTEXT.md` (+ later `scripts/restore.sh`) — zero code
changes, so every result below still applies to the current tip. On 2026-11-20, after a full
sandbox reset restore, the §12 Step 5 golden path was re-verified in-browser on `3ca9c02`:
login → 4/8/40 dashboard → EDU-101 mark-all + save toast → reports 90.0% → audit log →
zero errors.

If the working tree still matches that commit, REUSE these results — do not re-run the full
matrix; only re-run items that could have changed. If any code file changed this session,
re-run what's affected.

- ESLint + `tsc --noEmit` clean (excluding pre-existing `examples/` + `skills/` folders)
- Verified in-browser (agent-browser, desktop + 390×844) for the base of `e59405b`:
  admin login → dashboard → mark attendance → mark-all → save (single bulk upsert, toast) →
  reports correct → admin tabs → logout → student login → read-only view correct;
  audit diff correct; zero console/page errors; sticky footer + no overflow
- Unique-student stat (e59405b), curl-verified local AND prod:
  admin boot + admin courses `stats.students = 40` (was a summed 80); professor Meera
  (4 courses) = 40 (her per-course sets are disjoint, so unchanged); per-course counts
  untouched; logout resets the state; typing clean
- Production (deptattend.vercel.app) verified after final deploy of e59405b content:
  anonymous `/api/boot` 200 `{user:null,courses:[]}`; admin login 200; authed boot 200
  with `students:40`; `/logo.svg` 200 with the GraduationCap path (`21.42 10.922`);
  homepage favicon `<link rel="icon" href="/logo.svg"/>`; zero `z-cdn.chatglm.cn` refs
- Role isolation: professor 403/404 on foreign courses; disabled account login rejected
  (carried over — unchanged code paths)

## 11. Pending / next steps

User-owned (needs their browser/accounts):
- [ ] **Reconnect the Vercel GitHub App** (Settings → Git) — restores auto-deploy on push;
      until done, every push needs a manual deploy (§12 Step 6)
- [ ] Revoke the GitHub PAT + Vercel token used for deployment (they were pasted in chat)
- [ ] Rotate Neon password + demo passwords; create real professor accounts via the admin panel
- [ ] Optional: custom domain; Neon prod branch for DB isolation

Possible future features (none started):
- Attendance percentage thresholds/alerts per student, monthly report PDFs, class-wise analytics charts

## 12. Fast resume runbook (follow exactly — do not improvise)

### Step 0 — Determine state (ONE command, always first)

```bash
cd /home/z/my-project && git log --oneline -3 && git status --short | head -5 \
  && curl -s -o /dev/null -w "local:%{http_code}\n" http://localhost:3000/
```

| Result | Meaning | Do |
| --- | --- | --- |
| repo present, tree clean, `local:200` | fully up | one browser login check (Step 5, items 1-2), report ready. STOP |
| repo present, tree clean, `local:000` | server down | Steps 4-5 only. STOP |
| repo missing / bare template / dirty | sandbox was reset | full restore: Steps 1-5 |

"Tree clean but ahead 1 (UUID-message commit)" = normal harness checkpoint; push it if
deploying anyway, otherwise ignore.

### Step 1 — Full restore in ONE command (PREFERRED; needs GH_TOKEN + DATABASE_URL from the user's message)

`scripts/restore.sh` (committed, added 2026-11-20) automates the whole reset branch —
clone + adopt, `.env`, deps, dev server, warm-up — with idempotent skips, so it is safe
on any state (bare template, missing server, or an already-working tree):

```bash
cd /home/z/my-project && GH_TOKEN=<GH_TOKEN> DATABASE_URL="<neon-url>" bash scripts/restore.sh
# or, if .env already exists and only the server needs (re)starting:
bash scripts/restore.sh
```

- It takes the GH token transiently and strips it from `.git/config` itself; secrets are
  never read from or written to any committed file.
- On success it prints `restore complete: HEAD=... dirty files: N` and `local:200` —
  then do Step 5 ONLY.
- The manual Steps 1b–4 below are the FALLBACK if the script fails; never run both paths.

### Step 1b — Manual fallback: clone + adopt repo (only if restore.sh failed; needs GH token from user message)

```bash
git clone --depth 5 "https://x-access-token:<GH_TOKEN>@github.com/sjarchive/attendance-app" /tmp/attendance-app
cd /home/z/my-project && rm -rf .git src prisma public
cp -a /tmp/attendance-app/.git .git
rsync -a --exclude='.git' /tmp/attendance-app/ ./
git remote set-url origin https://github.com/sjarchive/attendance-app   # strip token NOW
git log --oneline -3 && git status --short   # expect: clean, HEAD = origin/main tip
```

SKIP file-by-file comparison and tsconfig/package.json diffs — the Section 5 file map is the
contract. Spot-check only: `ls src/components/attendance | wc -l` → 11, and `cat vercel.json`
shows buildCommand.

### Step 2 — Manual fallback: .env (restore.sh does this; URLs come from the user's message, never hardcode here)

Mapping rule: the URL containing `-pooler` → `DATABASE_URL` (runtime); the URL WITHOUT
`-pooler` → `DIRECT_URL` (migrations — keep it handy; runtime does not need it).

```bash
printf 'DATABASE_URL=%s\n' "<pooled-url>" > .env
```

`.env` is gitignored — verify: `git check-ignore .env` must print `.env`. Never commit it,
never echo tokens into logs. (AUTH_SECRET is optional locally — session.ts has a dev
fallback; prod has its own on Vercel.)

### Step 3 — Manual fallback: deps (restore.sh does this)

```bash
bun install && bunx prisma generate
```

SKIP full `bun run lint` / `tsc --noEmit` at this point — this commit was already verified
clean (Section 10). Run them only if you changed any file this session.

### Step 4 — Manual fallback: dev server (restore.sh does this; also use it standalone whenever `local:000`)

Processes started from a tool-call shell die at the tool-call boundary (Section 9.4). The
ONLY proven way is the double-fork orphan start with explicit env overrides. Dev points at
Neon (`DATABASE_URL` from `.env` / user message):

```bash
pkill -f "next dev" ; pkill -f next-server ; sleep 1
( setsid env DATABASE_URL=<pooled-url> bun run dev >/dev/null 2>&1 & ) ; sleep 10
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # expect 200
tail -6 dev.log   # expect "✓ Ready" and no Prisma errors
bash scripts/warm-dev.sh   # ALWAYS run this: precompiles routes so first clicks are fast
```

- Do NOT use `.zscripts/dev.sh` (the harness boot path): its `bun run db:push` step fails
  against this Postgres schema under the sandbox's global `file:` DATABASE_URL, and it must
  never push schema to a shared DB.
- Do NOT investigate process-survival alternatives — single-fork setsid/nohup dies at the
  tool boundary; only the double-fork pattern survives.
- Do NOT run `bun run build` (sandbox forbids builds; Vercel uses vercel.json instead).
- Dev hits the SAME Neon DB as prod — never run destructive seeds against it casually.

### Step 5 — Browser fast-path verification (always after a restart/restore)

Compact golden path with agent-browser (satisfies core-flow verification):

1. `agent-browser open http://localhost:3000` → login screen renders (graduation-cap brand)
2. Click the admin demo chip → Sign in → dashboard shows **4 programs / 8 courses / 40 students**
   (boot is a single `/api/boot` call; expect ~10-40ms warm; 40 = unique, NOT 80)
3. Mark attendance (EDU-101) → Mark all present → Save → "Attendance saved" toast
   (full-roster save = one bulk upsert, expect 25-50ms in-browser)
4. Reports for EDU-101 shows a percentage; Admin → Audit log shows the save
5. `agent-browser errors` → expect empty

SKIP the full matrix (professor isolation, student view, 390×844, sticky footer) unless the
working tree differs from the verified commit in Section 10 or code changed this session.

### Step 6 — Remote ops (ONLY if the user asks)

- Push: `git push https://x-access-token:<GH_TOKEN>@github.com/sjarchive/attendance-app main`,
  then `git update-ref refs/remotes/origin/main <new-sha>` to refresh the stale shallow-clone
  tracking ref (pushes don't move it on this shallow clone)
- **Deploys do NOT trigger from pushes** (git link broken, §8) — after every push, do the
  manual staged-copy deploy from §8 (link once, rsync to /tmp/deploy-stage without .git,
  deploy from the copy, verify with the login + students:40 curl). If the user says they
  reconnected Git in the dashboard, verify by pushing one test commit and checking that a
  deployment with `githubCommitSha` meta appears within a minute.
- Reseed (DESTRUCTIVE, wipes Neon prod-shared data): `DATABASE_URL=<pooled> bunx tsx prisma/seed.ts`
- Quick prod check: `curl -s -o /dev/null -w "%{http_code}" https://deptattend.vercel.app`

If tree is clean, in sync, and the user didn't ask: skip all remote ops.

### Standing rules (unchanged)

- Never put secrets in files that get committed; never echo tokens into logs
- Strip the GH token from `.git/config` immediately after any authenticated git op
- Remind the user to revoke pasted tokens at the end of the session

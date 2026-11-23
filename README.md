# Attendance Tracker

A student attendance tracking app for a college department. Professors mark daily
attendance per course, manage rosters, and review reports with CSV export. An ADMIN
(HoD) manages professor accounts, programs and courses. Students get a read-only view
of their own attendance history.

**Live demo**: https://attendance.nvy.workers.dev (auto-deployed from `main`
via Cloudflare Workers Builds)

## Features

- Role-based access: ADMIN, PROFESSOR, STUDENT (read-only self-view)
- Daily marking with four statuses: Present / Absent / Late / Leave
- Keyboard shortcuts (P/A/L/V, arrow keys) and "mark all present" for fast roll-call
- Past dates can be re-opened and corrected; future dates are blocked
- Duplicate-proof saves (upsert per course + student + date)
- Per-course roster management with soft-removal (attendance history preserved)
- CSV roster import and CSV attendance export
- Reports: attendance percentages per student and per session
- Admin panel: professors (with password reset / enable / disable), programs, courses
- Audit trail of every mutation (who changed what, when)

## Tech Stack

- Next.js 16 (App Router) + TypeScript 5
- Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons
- Prisma ORM (D1 driver adapter) + Cloudflare D1 (SQLite) on Cloudflare Workers
- Auth: HMAC-SHA256 signed session cookie (Web Crypto, Edge-compatible), bcryptjs
  password hashing, login rate limiting
- zod validation on every API route; single-page UI on the `/` route

## Getting Started

Prerequisites: [Bun](https://bun.sh) (or Node 20+ with npm). The database is
Cloudflare D1 (SQLite) — no local Postgres needed.

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create `.env` in the project root (only used by Prisma CLI tooling; at
   runtime the D1 driver adapter + `DB` binding in `wrangler.jsonc` take over):

   ```env
   DATABASE_URL=file:./prisma/dev.db
   AUTH_SECRET=<random 32-byte hex>
   ```

   - `AUTH_SECRET` — signs the session cookie (`openssl rand -hex 32`)

3. (Optional) local dev with a local D1 database:

   ```bash
   npm run cf:migrate:local   # applies d1/migrations/*.sql to local D1
   npm run cf:preview         # next dev + local Worker bindings
   ```

4. Start the dev server:

   ```bash
   bun run dev
   ```

### Demo credentials (after seeding)

| Role | Username | Password |
| --- | --- | --- |
| ADMIN (HoD) | `admin` | `admin123` |
| Professor | `meera` | `prof123` |
| Professor | `rajesh` | `prof123` |
| Student (read-only) | `bed-01` | `BED-01` |

Student accounts are optional and created by an admin (username = their roll
number in lowercase, initial password = roll number). Rotate or remove all demo accounts before real use.

### Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Dev server on port 3000 |
| `bun run build` | Standalone production build (self-hosting) |
| `bun run start` | Serve the standalone build |
| `bun run lint` | ESLint |
| `bunx tsc --noEmit` | Type check |
| `bunx prisma migrate dev` | Create a migration after schema changes |
| `bunx prisma migrate deploy` | Apply migrations |
| `npm run cf:build` | OpenNext build for Cloudflare Workers (+ cookie patch) |
| `npm run cf:deploy` | Build and deploy to Cloudflare Workers |
| `npm run cf:migrate:remote` | Apply `d1/migrations/` to the remote D1 database |
| `npm run cf:migrate:local` | Apply `d1/migrations/` to local D1 (dev) |

## Deploying to Cloudflare Workers + D1

The primary deployment target. Uses the [OpenNext Cloudflare adapter]
(https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`) and Prisma's
D1 driver adapter (`@prisma/adapter-d1`) against a D1 SQLite database.

### CI/CD: Cloudflare Workers Builds (active)

The repo is connected to the `attendance` Worker through Cloudflare Workers
Builds — no API tokens or secrets are stored in GitHub or locally:

- **Push to `main`** → build (`npm ci && npx prisma generate && npx
  opennextjs-cloudflare build && node scripts/patch-opennext-cookie.mjs`) →
  `npx wrangler deploy` → https://attendance.nvy.workers.dev
- **Push to any other branch / open a PR** → preview build deployed with
  `npx wrangler preview` (unique preview URL, production untouched)
- Build caching is enabled; build logs are in the Cloudflare dashboard
  (Worker → Settings → Builds → View build)

The `name` in `wrangler.jsonc` must match the connected Worker (`attendance`)
or the build fails.

### Manual deploy (optional)

To deploy by hand instead of relying on CI:

1. Log in / provide credentials:

   ```bash
   export CLOUDFLARE_API_TOKEN=<token with D1 + Workers edit permissions>
   export CLOUDFLARE_ACCOUNT_ID=<account id>
   # or: npx wrangler login
   ```

2. Create the D1 database once and put its id in `wrangler.jsonc`
   (`d1_databases[].database_id`):

   ```bash
   npx wrangler d1 create attendance-app-db
   ```

3. Build, apply migrations and deploy:

   ```bash
   npm run cf:deploy             # opennext build + cookie patch + wrangler deploy
   npm run cf:migrate:remote     # applies d1/migrations/*.sql to the remote D1
   ```

4. Set the session secret once (regenerates a deployment):

   ```bash
   openssl rand -hex 32 | npx wrangler secret put AUTH_SECRET
   ```

5. (Optional) seed demo data — `d1/seed.sql` mirrors `prisma/seed.ts`:

   ```bash
   npx wrangler d1 execute DB --remote --file d1/seed.sql -y
   ```

6. Sign in as ADMIN and create the real professor accounts in the Admin panel.

Notes:
- `scripts/patch-opennext-cookie.mjs` works around a known bug in
  `@opennextjs/cloudflare` 1.20.x where the Next 16 proxy (`proxy.ts`) crashes
  on any request carrying a Cookie header (bundled `cookie` v1 has no default
  export). It is wired into `cf:build` / `cf:deploy`; drop it once upstream
  fixes the ESM interop.
- Schema changes: edit `prisma/schema.prisma`, then regenerate the migration
  with `npx prisma migrate diff --from-empty --to-schema-datamodel
  prisma/schema.prisma --script > d1/migrations/000N_<name>.sql` and run
  `npm run cf:migrate:remote`.

### Legacy: Vercel + Neon (PostgreSQL)

The original deployment path is kept as documentation. To use it, switch
`prisma/schema.prisma` back to `provider = "postgresql"` (with `url` +
`directUrl`) and restore the PostgreSQL-flavored bulk upsert in
`src/app/api/attendance/route.ts` (the current statement is SQLite/D1-flavored).

1. Create a Neon project and copy both connection strings (pooled + direct).
2. Create a Vercel project and set the environment variables:
   `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `AUTH_SECRET`.
3. Deploy — `vercel.json` already overrides the build command to
   `prisma generate && next build`:

   ```bash
   vercel deploy --prod
   ```

   Alternatively connect the GitHub repo in the Vercel dashboard for auto-deploys on push.
4. On a fresh database, run migrations and seed against production once:

   ```bash
   DATABASE_URL=<pooled> DIRECT_URL=<direct> bunx prisma migrate deploy
   DATABASE_URL=<pooled> bunx tsx prisma/seed.ts   # optional demo data
   ```

5. Sign in as ADMIN and create the real professor accounts in the Admin panel.

### Self-hosting alternative

```bash
bun run build   # standalone Next.js build
bun run start   # serves .next/standalone/server.js
```

## Project Structure

```
prisma/            schema.prisma (sqlite), migrations/, seed.ts
d1/                migrations/ (D1 SQL applied by wrangler), seed.sql (demo data)
src/app/           page.tsx (single-page UI) + api/ route handlers
src/components/    attendance/ — login, dashboard, marker, roster, reports, admin, audit
src/lib/           session, db (D1 driver adapter), auth, audit, rate-limit, course-access, csv, date helpers
src/proxy.ts       session gate for all API routes (except /api/auth/*)
wrangler.jsonc     Cloudflare Workers config (D1 binding, assets, nodejs_compat)
open-next.config.ts  OpenNext Cloudflare adapter config
```

## Security Notes

- All API routes require a valid session (middleware) except `/api/auth/*`.
- Professors can only access their own courses (ownership checks return 403/404).
- Login is rate-limited (10 attempts / 5 min per IP+username); generic "invalid credentials" errors.
- Attendance records are unique per `(courseId, studentId, date)` — upsert-based, no duplicates.
- Removed students keep their attendance history; only their enrollments are deactivated.
- All create/update/delete mutations are recorded in the audit log.
- Future dates cannot be marked. `.env` is gitignored — never commit secrets.

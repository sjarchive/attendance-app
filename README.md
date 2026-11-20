# Department Attendance Tracker

A student attendance tracking app for a college department. Professors mark daily
attendance per course, manage rosters, and review reports with CSV export. An ADMIN
(HoD) manages professor accounts, programs and courses. Students get a read-only view
of their own attendance history.

**Live demo**: https://deptattend.vercel.app

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
- Prisma ORM + PostgreSQL (Neon): pooled connection at runtime, direct endpoint for migrations
- Auth: HMAC-SHA256 signed session cookie (Web Crypto, Edge-compatible), bcryptjs
  password hashing, login rate limiting
- zod validation on every API route; single-page UI on the `/` route

## Getting Started

Prerequisites: [Bun](https://bun.sh) (or Node 20+ with npm) and a PostgreSQL database
([Neon](https://neon.tech) recommended).

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create `.env` in the project root:

   ```env
   DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   DIRECT_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   AUTH_SECRET=<random 32-byte hex>
   ```

   - `DATABASE_URL` — pooled connection string (runtime queries)
   - `DIRECT_URL` — direct connection string (used by Prisma Migrate)
   - `AUTH_SECRET` — signs the session cookie (`openssl rand -hex 32`)

3. Apply migrations and (optionally) seed demo data:

   ```bash
   bunx prisma migrate deploy
   bunx tsx prisma/seed.ts
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
| Student (read-only) | `bed1-01` | `BED1-01` |

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

## Deploying to Vercel + Neon

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
prisma/            schema.prisma, migrations/, seed.ts
src/app/           page.tsx (single-page UI) + api/ route handlers
src/components/    attendance/ — login, dashboard, marker, roster, reports, admin, audit
src/lib/           session, db, auth, audit, rate-limit, course-access, csv, date helpers
src/middleware.ts  session gate for all API routes (except /api/auth/*)
```

## Security Notes

- All API routes require a valid session (middleware) except `/api/auth/*`.
- Professors can only access their own courses (ownership checks return 403/404).
- Login is rate-limited (10 attempts / 5 min per IP+username); generic "invalid credentials" errors.
- Attendance records are unique per `(courseId, studentId, date)` — upsert-based, no duplicates.
- Removed students keep their attendance history; only their enrollments are deactivated.
- All create/update/delete mutations are recorded in the audit log.
- Future dates cannot be marked. `.env` is gitignored — never commit secrets.

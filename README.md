# Department Attendance Tracker

A student attendance tracking app for a college department, built per `upload/attendance-app-plan.md`.

Professors mark daily attendance per course, manage rosters, view reports and CSV exports. An ADMIN (HOD) manages professor accounts, programs and courses. Students have read-only access to their own attendance history.

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (New York) + Lucide icons
- **Prisma ORM** — PostgreSQL on Neon (pooled connection at runtime, direct endpoint for migrations)
- Auth: signed HMAC-SHA256 session cookie (Web Crypto, Edge-compatible), bcryptjs password hashing, login rate limiting
- Validation: zod on every API route; audit log for all mutations

## Live Site (this environment)

- **Production (Vercel + Neon)**: https://attendance-app-seven-phi.vercel.app
- Local dev server: **port 3000** — use the **Preview Panel** (or "Open in New Tab").
- The sandbox only exposes the `/` route, so no other pages exist.
- Local dev and production share the same Neon database in this setup.

### Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| ADMIN (HOD) | `admin@dept.edu` | `admin123` |
| Professor | `meera@dept.edu` | `prof123` |
| Professor | `rajesh@dept.edu` | `prof123` |
| Student (read-only) | `bed1-01@student.dept.edu` | `BED1-01` |

## Local Development

The schema is PostgreSQL, so local dev also runs against the Neon database:

```bash
bun install
bunx prisma migrate deploy   # apply migrations (uses DIRECT_URL)
bunx tsx prisma/seed.ts      # seed ADMIN, professors, programs, courses, students, demo attendance
bun run dev                  # start dev server on port 3000
bun run lint                 # ESLint
bunx tsc --noEmit            # type check
```

### Environment variables (`.env`)

```
DATABASE_URL=postgresql://...pooler...neon.tech/neondb?sslmode=require   # runtime (pooled)
DIRECT_URL=postgresql://...neon.tech/neondb?sslmode=require              # migrations (direct)
AUTH_SECRET=<random-32-byte-hex>   # signs the session cookie; production uses its own
```

`.env` is gitignored — never commit real secrets.

> Sandbox quirk: this environment exports `DATABASE_URL=file:...` globally, and process env
> overrides `.env` files. Start the dev server with explicit overrides:
> `DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-) DIRECT_URL=... bun run dev`

## Production Deployment (plan Step 9 — completed)

Deployed: **https://attendance-app-seven-phi.vercel.app** (Vercel) + Neon Postgres (ap-southeast-1).

What was done:

1. `prisma/schema.prisma` switched to `postgresql` with `directUrl = env("DIRECT_URL")`.
2. Schema pushed to Neon, baseline migration `prisma/migrations/0_init` created via
   `prisma migrate diff` and marked applied (`prisma migrate resolve --applied 0_init`).
3. Database seeded (ADMIN + demo data) against Neon.
4. Repo pushed to GitHub: `sjarchive/attendance-app` (private). `.env` untracked.
5. Vercel project `attendance-app` linked via CLI; production env vars set:
   `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `AUTH_SECRET` (fresh random hex).
   `vercel.json` overrides build: `prisma generate && next build`.
6. Deployed with `vercel deploy --prod`.
7. Smoke test on the live URL passed: login → mark → re-open and edit → logout.

### Redeploy after changes

```bash
vercel deploy --prod   # needs a Vercel token: --token <TOKEN>
git push               # keep GitHub in sync
```

Optional CI: install the Vercel GitHub App (vercel.com dashboard → Project → Settings → Git)
to auto-deploy on every push (CLI `vercel git connect` requires the app installed interactively).

### Creating real accounts

Sign in as ADMIN (`admin@dept.edu`) on the live URL, use the Admin panel to create the real
professor accounts and distribute credentials. Rotate the demo passwords first.

### Alternative: self-hosted production build

```bash
bun run build   # standalone Next.js build
bun run start   # serves .next/standalone/server.js (logs to server.log)
```

## Security Notes

- All API routes require a valid session (middleware) except `/api/auth/*`.
- Professors can only access their own courses (ownership checks return 403/404).
- Login is rate-limited (10 attempts / 5 min per IP+email); generic "invalid credentials" errors.
- Attendance records are unique per `(courseId, studentId, date)` — upsert-based, no duplicates.
- Deleted students are soft-deleted (`active=false`) to preserve attendance history.
- All create/update/delete mutations are recorded in the audit log.
- Future dates cannot be marked.

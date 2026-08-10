# 20FIT CRM

Internal **Audience Data & CRM** for 20FIT — audience pool, profiling,
segmentation and marketing automation for the Marketing Division.

> **Sprint 1 = foundation only.** Repo, design system, app shell, authentication
> and the deploy pipeline. **No** database migrations, **no** customer-table
> queries, **no** message sending. Those arrive in later sprints (see PRD §22).

Full spec: `PRD — 20FIT Audience Data & CRM System v1.1`.

> ## ⚠️ MANDATORY DEPLOY ORDER — RBAC fails closed
>
> 1. **Run the `crm_*` migrations** (`supabase/migrations/`).
> 2. **Seed the first `super_admin`** in `crm_user_role`.
> 3. **Only then deploy the RBAC code.**
>
> RBAC resolves every user's role from `crm_user_role` and **fails closed**: no row
> → no role → access denied. If the RBAC code reaches production **before** steps
> 1–2, **everyone is locked out of the app.**
>
> **Do NOT merge the RBAC branch (`claude/20fit-crm-sprint-2`) into `main` until
> steps 1–2 are done** — a push to `main` triggers Railway's auto-deploy, and the
> lockout is immediate. This warning is here, not only in `lib/auth/current-role.ts`,
> because whoever merges is reading this file, not the auth code.

> ## ⚠️ Migration ledger diverged — do NOT run `supabase db push`
>
> Six of the seven Sprint 2 migrations were applied to `cpvzwqptzcxnwzfzgrmt` on
> 2026-08-10 via the Supabase MCP `apply_migration` (one per review gate). That path
> stamps its **own** ledger version, which does **not** match the repo file-name
> timestamps. Migration 3 (`crm_consent`) was deliberately **skipped** (awaiting
> legal sign-off) and is absent from the ledger.
>
> | Repo file (prefix) | Ledger version | Ledger name |
> |---|---|---|
> | `…074534_create_crm_user_role` | `20260810125856` | `create_crm_user_role` |
> | `…074535_create_crm_audit_log` | `20260810131751` | `create_crm_audit_log` |
> | `…074536_create_crm_consent` | **— skipped (held for legal)** | — |
> | `…074537_create_crm_suppression` | `20260810132715` | `create_crm_suppression` |
> | `…074538_create_crm_profile_demographic` | `20260810133334` | `create_crm_profile_demographic` |
> | `…074539_create_crm_profile_behavior` | `20260810133751` | `create_crm_profile_behavior` |
> | `…074540_create_crm_profile_scores` | `20260810134736` | `create_crm_profile_scores` |
>
> **Do NOT run `supabase db push` against this project until the ledger and repo are
> reconciled.** No repo file-name timestamp exists in the ledger, so the CLI would
> treat all seven repo migrations as unapplied and try to run them all — re-running
> the six live tables (which fail as "already exists") **and** applying the held
> migration 3. Run any further migration one-by-one via a reviewed path, not `db push`.

## Stack

- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS 3 + shadcn/ui (restyled to the 20FIT design tokens)
- Supabase Auth via `@supabase/ssr` (cookie-based sessions, no localStorage)
- Self-hosted fonts via `next/font` (Barlow Condensed, JetBrains Mono, Manrope)
- Deploy: Railway (source = GitHub, auto-deploy on `main`)

## Run locally

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

- The first user is created by an admin in **Supabase Dashboard → Authentication
  → Add user**. There is no self-registration.
- Unauthenticated requests are redirected to `/login`. Only `/login` and
  `/health` are public.

### Verification pages (development only)

- `/dev/tokens` — every colour token, all three fonts, and all restyled
  components. Returns 404 in production.
- `/dev/shell` — the authenticated shell without needing a live session.

## Environment variables

Set these in **Railway → Variables** (and in `.env.local` for local dev). Never
commit real values — `.env*` is git-ignored except `.env.example`.

| Variable | Scope | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Project `cpvzwqptzcxnwzfzgrmt`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses all RLS. **Never** prefix with `NEXT_PUBLIC_`. Unused in Sprint 1. |
| `NEXT_PUBLIC_APP_ENV` | client | `production` on Railway. |
| `NODE_ENV` | build | Forced to `production` by the `railway.json` build command — **do not set it as a Railway Variable**. See [Deploy](#deploy). |

Not needed yet (noted so they aren't forgotten): `RESEND_API_KEY`,
`WHATSAPP_*`, `MAYAR_WEBHOOK_SECRET`.

## Deploy

Railway builds and deploys automatically on every push to `main`
(`railway.json`: build `NODE_ENV=production npm run build`, start `npm run start`;
the port is read from `process.env.PORT` by `next start`).

### Why the build command hard-codes `NODE_ENV=production`

`railway.json` is JSON and cannot carry comments, so the reasoning lives here.
**Do not remove the `NODE_ENV=production` prefix without reading this.**

- Railway's build environment can inherit a wrong `NODE_ENV`. Railway's
  **Suggested Variables** reads values straight from source files and offers to
  add them — that is how `NODE_ENV=development` got set once already.
- Without the prefix, `next build` inherits that value and **fails across all 19
  pages**: React's dev and prod runtimes mix and prerendering throws `TypeError:
  Cannot read properties of null (reading 'useContext')`. Reproduced locally with
  `NODE_ENV=development npm run build` → 90 `useContext` errors, exit 1.
- The prefix **forces `production` regardless of the inherited value**, so the
  build is deterministic whatever the environment carries.
- **Beware false-green local tests.** `next build` resolves `NODE_ENV || 'production'`,
  so an **unset** _and_ an **empty** value both silently become `production` —
  `env -u NODE_ENV npm run build` and `NODE_ENV="" npm run build` both PASS and
  prove nothing. To replicate the real Railway failure you must set a wrong value:
  `NODE_ENV=development npm run build`. A green build from unset/empty is **not**
  evidence that the prefix is safe to remove — that mistake has been made twice.
- **Never remove this prefix** until a real Railway build is proven green without
  it (locally, until `NODE_ENV=development npm run build` builds clean without it).

- `GET /health` → `{ ok, timestamp, supabase: "reachable" | "unreachable" }`.
  It pings only Supabase's public liveness endpoint — no keys leaked, no
  customer table touched.

## Design system

`app/globals.css` is the single source of truth for colour, radius and surface
tokens (20FIT Design System v1.0, mirrored in PRD §18). **Hard-coded hex outside
`globals.css` is a review-blocking defect** — components use Tailwind token
classes (`bg-red`, `text-ink`, `rounded-card`, `.glass`) that resolve to CSS
variables, so one `[data-theme="dark"]` switch re-tints the whole surface.

Brand logos live in `public/brand/` — currently **placeholders**; see
`public/brand/README.md` to install the official assets.

## Project layout

```
app/
  (app)/            authenticated shell + dashboard + placeholder screens
  login/            dark login screen + sign-in server action
  logout/           sign-out route
  health/           liveness + Supabase reachability
  dev/              tokens & shell previews (dev only)
  globals.css       design tokens (single source of truth)
components/
  ui/               restyled shadcn primitives
  shell/            sidebar, app shell, theme toggle, nav
  brand/            BrandLogo
  dashboard/        stat card + dashboard content
lib/
  supabase/         client / server / admin / middleware helpers
  theme.ts          theme cookie helpers
middleware.ts       auth gate
```

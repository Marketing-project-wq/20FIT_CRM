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
> All seven Sprint 2 migrations were applied to `cpvzwqptzcxnwzfzgrmt` via the Supabase
> MCP `apply_migration` (one per review gate). Six went in on 2026-08-10; migration 3
> (`crm_consent`) was held for legal sign-off and applied on **2026-08-11 (Sprint 3F)**
> once legal cleared it. That path stamps its **own** ledger version, which does **not**
> match the repo file-name timestamps.
>
> | Repo file (prefix) | Ledger version | Ledger name |
> |---|---|---|
> | `…074534_create_crm_user_role` | `20260810125856` | `create_crm_user_role` |
> | `…074535_create_crm_audit_log` | `20260810131751` | `create_crm_audit_log` |
> | `…074536_create_crm_consent` | `20260811072232` | `create_crm_consent` |
> | `…074537_create_crm_suppression` | `20260810132715` | `create_crm_suppression` |
> | `…074538_create_crm_profile_demographic` | `20260810133334` | `create_crm_profile_demographic` |
> | `…074539_create_crm_profile_behavior` | `20260810133751` | `create_crm_profile_behavior` |
> | `…074540_create_crm_profile_scores` | `20260810134736` | `create_crm_profile_scores` |
>
> (Migration 8, `…090000_create_crm_purge_audit_log`, was added later and is applied too:
> ledger `20260811034942`.)
>
> **Do NOT run `supabase db push` against this project until the ledger and repo are
> reconciled.** No repo file-name timestamp exists in the ledger, so the CLI would
> treat all seven repo migrations (plus migration 8) as unapplied and try to run them
> all — re-running the now-**seven** live tables, which fail as "already exists". Run any
> further migration one-by-one via a reviewed path, not `db push`.

## Data-quality screen (`/quality`)

Live aggregates over `master_customer`, `customer_orphan`, `customer_excluded` and
the `crm_*` satellites. **No migration, no schema change** — every figure is a
PostgREST `count` with `head: true`, so no customer row is ever read into the
process and there is nothing to mask. Deliberate, so this screen never becomes a
reason to touch the diverged migration ledger above.

The cost of that choice is stated on the screen itself: PostgREST has no
column-to-column comparison and no regex, so two findings (`last_activity_at` =
`first_seen_at`, and strict identifier validation) **cannot** be recomputed live.
They sit in `VERIFIED_ARTIFACTS` in `lib/crm/quality-types.ts`, dated, labelled as
manual verification. Making them live requires a SQL view — not a looser filter that
quietly reports a different number under the same label.

Two related things changed:

- The audience banner **no longer hardcodes** the quality figures. Numbers written
  into a component keep rendering confidently long after the data has moved; the
  banner now carries only the qualitative warnings and links to `/quality`.
- That banner was also **invisible**. It used `amber-500` utilities, but
  `tailwind.config.ts` maps `amber` to a bare `var(--amber)`, which removes the
  numeric scale and blocks opacity modifiers — so `border-amber-500/40`,
  `bg-amber-500/[0.06]` and `text-amber-500` emitted no CSS at all. Tinted surfaces
  must use the `.tint-*` classes from `globals.css`. **Any `<colour>-<number>` class
  in this codebase is dead CSS**; the flat token classes (`text-amber`, `bg-red`) and
  the `.tint-*` utilities are the only working options.

`/quality` is gated on `profile.view_list`, the same action `canSeeNav("/quality")`
already resolves to. It is **not** audited — see the audit rule below.

## When a read is audited

There is ONE rule, and it is the same for every read endpoint:

> **Audit is mandatory when a response contains INDIVIDUAL ROWS, or when the
> aggregate is SHAPED BY USER-SUPPLIED PARAMETERS. A fixed, parameter-free aggregate
> is not audited.**

Audit answers *"who looked at whose data"*. A fixed count has no "whose" on its
object, so a row would answer nothing and only add volume for migration 8 to purge.
But the moment a caller can narrow an aggregate, the count can be squeezed until it
points at one person — at which point it stops being an aggregate and audit is
required again.

| Endpoint | Individual rows? | User params? | Audited |
|---|---|---|---|
| `/api/audience` (list) | yes | yes (filters) | **yes** — `list.viewed`, `master_customer` |
| `/api/audience/[id]` (detail) | yes | yes (id) | **yes** — `profile.viewed`, `target_id` |
| `/api/audit` (audit-log screen) | yes | yes (filters) | **yes** — `list.viewed`, `crm_audit_log` |
| `/api/quality` | no (counts) | no | **no** |
| `/api/dashboard` | no (counts) | no | **no** |

Every audit row reuses an action name already on migration 8's exact purge allowlist
(`list.viewed`, `profile.viewed`) — **never** a new name like `quality.viewed` or
`audit.viewed`, which would be neither purged nor compliance-protected and would
accumulate forever. `/api/quality` and `/api/dashboard` each carry a warning: if a
client-driven filter is ever added, audit becomes mandatory again, and the warning
sits in the file the person adding the filter will read. This rule is reversible — but
reverse it in **both** aggregate endpoints, never leave two answers.

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

**No `<colour>-<number>` classes, and no opacity modifier on a flat colour token.**
`tailwind.config.ts` maps `red / blue / amber / green` to a bare `var(--…)` (and
`ink / glass` to named sub-keys only). That removes the numeric scale *and* blocks
opacity modifiers, so `text-amber-500`, `bg-red-500`, `border-amber-500/40` and
`bg-amber-500/[0.06]` emit **no CSS at all** — not the wrong colour, no rule at all,
no error. Use the flat token classes (`text-amber`, `bg-red`, `text-ink-soft`) or the
`.tint-*` utilities from `globals.css` for tinted surfaces. The hex rule above catches
hex; it does not catch these vanishing classes, so `lib/design/tailwind-tokens.test.ts`
scans the source and fails if the pattern reappears.

Brand logos live in `public/brand/` — currently **placeholders**; see
`public/brand/README.md` to install the official assets.

## Project layout

```
app/
  (app)/            authenticated shell: dashboard + audience (list + [id] detail)
                    + quality + settings (audit log + roles) + placeholders
  api/audience/     read-only audience list + [id] detail (RBAC + masking + audit)
  api/quality/      read-only data-quality aggregates (RBAC, counts only, no audit)
  api/dashboard/    read-only KPI aggregates (RBAC, counts only, no audit)
  api/audit/        read-only audit-log (audit.view gate, paginated, self-audited)
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
  audience/         audience pool + profile detail
  quality/          data-quality dashboard
  settings/         roles panel + audit-log panel
lib/
  crm/              normalize / mask / audience+profile / quality / audit-log / dashboard / retention-policy
  auth/             RBAC matrix, role resolution, server guards
  supabase/         client / server / admin / middleware helpers
  theme.ts          theme cookie helpers
middleware.ts       auth gate
```

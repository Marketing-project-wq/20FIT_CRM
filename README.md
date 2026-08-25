# 20FIT CRM

Internal **Audience Data & CRM** for 20FIT — audience pool, profiling,
segmentation and marketing automation for the Marketing Division.

> **Sprint 1 = foundation only.** Repo, design system, app shell, authentication
> and the deploy pipeline. **No** database migrations, **no** customer-table
> queries, **no** message sending. Those arrive in later sprints (see PRD §22).

Full spec: `PRD — 20FIT Audience Data & CRM System v1.1`.

> ## 🧭 Scope authority — `docs/KEBUTUHAN-SISTEM.md`
>
> The product owner's standing statement of what this system must do (and what is **not** its
> job), dated 24 Aug 2026, lives in **[`docs/KEBUTUHAN-SISTEM.md`](docs/KEBUTUHAN-SISTEM.md)**.
> **When any other document in this repo conflicts with it, that file wins** — the one exception
> is database numbers, which are always re-measured (its §6). Read it before deciding whether a
> feature is in scope. Key standing consequences: **consent is not a gate** (every user is
> considered contactable); **unsubscribe (`crm_suppression`) is the only real gate**; the daily
> snapshot cannot answer event-based triggers; every send must leave an audit record.
>
> `docs/riwayat/` records why this system is the way it is: every sprint's prompt,
> the decisions taken (`KEPUTUSAN.md`) and **what would reverse each one**, the
> findings and self-corrections (`TEMUAN.md`), the database facts with dates
> (`FAKTA-DATA.md`), and the sprint/commit/ledger timeline (`LINIMASA.md`).
>
> **Open it before you touch anything whose code comment reads like a warning** — a
> canon (`normalize.ts`), a `revoke`, a `NODE_ENV=production` prefix, an "exact match
> only". The reason the warning exists is a decision in `KEPUTUSAN.md`; changing the
> code without reading it is how a rule gets broken silently instead of on purpose.
> The two big warning blocks below each map to a decision there (K-18, ledger).

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
> steps 1–2 are done** — a push to the deployed branch triggers Railway's auto-deploy, and the
> lockout is immediate. This warning is here, not only in `lib/auth/current-role.ts`,
> because whoever merges is reading this file, not the auth code.
>
> **RETRACTION (2026-08-24):** the 2026-08-12 "CORRECTION" that once stood here — claiming the
> deployed branch was *not* `main` — was **wrong and is withdrawn**. The Railway dashboard
> (Settings → Source) shows production connected to **`main`** with auto-deploy on push, exactly
> as the original text above says. The 12 Aug "branch code serves production" reasoning rested on
> a `git log -S` run against a **stale `origin/main` ref**: the audit action's commit (`a9602d5`)
> was already merged into `main` via **PR #10 at 04:41 UTC**, seven minutes *before* the
> production reset wrote those audit rows at 04:48 UTC. Production ran freshly-deployed `main`, not
> branch code. See T-22 (corrected) and T-27 in `docs/riwayat/TEMUAN.md`. **Merge to `main` = a
> production deploy** — the "do NOT merge until steps 1–2 are done" order above stands, and is now
> confirmed to be the exact and only trigger.

> ## ⚠️ Migration ledger diverged — do NOT run `supabase db push`
>
> Every CRM migration was applied to `cpvzwqptzcxnwzfzgrmt` via the Supabase MCP
> `apply_migration` (one per review gate), which stamps its **own** ledger version that
> does **not** match the repo file-name timestamp. Full map below — verified against
> `supabase_migrations.schema_migrations` on 2026-08-11.
>
> | # | Repo file (prefix) | Ledger version(s) | Ledger name |
> |---|---|---|---|
> | 1 | `…074534_create_crm_user_role` | `20260810125856` | `create_crm_user_role` |
> | 2 | `…074535_create_crm_audit_log` | `20260810131751` | `create_crm_audit_log` |
> | 3 | `…074536_create_crm_consent` | `20260811072232` | `create_crm_consent` |
> | 4 | `…074537_create_crm_suppression` | `20260810132715` | `create_crm_suppression` |
> | 5 | `…074538_create_crm_profile_demographic` | `20260810133334` | `create_crm_profile_demographic` |
> | 6 | `…074539_create_crm_profile_behavior` | `20260810133751` | `create_crm_profile_behavior` |
> | 7 | `…074540_create_crm_profile_scores` | `20260810134736` | `create_crm_profile_scores` |
> | 8 | `…090000_create_crm_purge_audit_log` | `20260811034942` | `create_crm_purge_audit_log` |
> | 9 | `…100000_create_crm_record_suppression` | `20260811081711` **+** `20260811081920` | `create_crm_record_suppression` (×2) |
> | 10 | `…110000_lock_crm_purge_audit_log_execute` | `20260811085420` | `lock_crm_purge_audit_log_execute` |
> | 11 | `…20260812000000_create_crm_backfill_consent` | `20260812041851` | `create_crm_backfill_consent` |
> | 12 | `…20260812010000_add_crm_consent_contactability_index` | `20260812045411` | `add_crm_consent_contactability_index` |
> | 13 | `…20260812020000_create_crm_contactable_counts` | `20260812063419` | `create_crm_contactable_counts` |
> | 14 | `…20260813000000_create_crm_staging_segment_ids` | `20260813034302` | `create_crm_staging_segment_ids` |
> | 15 | `…20260813091255_create_crm_customer_mirror` | `20260813091255` | `create_crm_customer_mirror` |
> | 16 | `…20260814040554_add_is_fitco_member_matched_to_crm_customer_mirror` | `20260814040554` | `add_is_fitco_member_matched_to_crm_customer_mirror` (pulled from PR #13, verbatim SQL) |
> | 17 | `…20260814055353_crm_norm_phone_guard_empty_nsn` | `20260814055353` | `crm_norm_phone_guard_empty_nsn` (pulled from PR #13, verbatim SQL) |
> | 18 | `…20260818041017_precompute_dashboard_stats_at_refresh` | `20260818041017` | `precompute_dashboard_stats_at_refresh` (consolidated from PR #13, 2026-08-21 — precompute dashboard stats into `crm_mirror_meta.dashboard_stats` at refresh; reader `crm_mirror_dashboard_stats()` + diagnostic `crm_mirror_fitco_staleness()`; refresh switched to `CONCURRENTLY`) |
> | 19 | `…20260819061103_schedule_crm_mirror_refresh` | `20260819061103` | `schedule_crm_mirror_refresh` (pg_cron daily mirror refresh, K-30) |
> | 20 | `…20260819113518_crm_purge_audit_log_add_demographic_compliance` | `20260819113518` | `crm_purge_audit_log_add_demographic_compliance` (Opsi 2 / K-09 — adds `profile.demographic_updated` to the compliance denylist; migration 8 untouched) |
> | 21 | `…20260819113649_create_crm_upsert_profile_demographic` | `20260819113452` **+** `20260819113649` | `create_crm_upsert_profile_demographic` (×2 — first apply hit an `array_cat` bug, re-applied fixed) |
> | 22 | `…20260821041044_pin_search_path_crm_audit_log_no_mutate` | `20260821041044` | `pin_search_path_crm_audit_log_no_mutate` (K-15 hardening — pins `search_path` on the append-only guard `crm_audit_log_no_mutate`; applied 2026-08-21, both triggers verified still reject UPDATE+DELETE) |
> | 23 | `…20260821154415_unify_identity_sources_aplus` | `20260821154415` | `unify_identity_sources_aplus` (Migrasi 23 / jalur A+ — unifies identity sources into the mirror; merged via PR #14) |
> | 24 | `…20260824135604_crm_message_template` | `20260824135604` | `crm_message_template` (contacting-half — message-template storage: append-version, bilingual, email+WhatsApp with `wa_approval_status`; RLS on / 0 policy, relacl `{postgres, service_role}`. Applied + verified this session) |
> | 25 | `…20260824145501_crm_message_log` | `20260824145501` | `crm_message_log` (send path — one row per send attempt, keyed `customer_id`; mirrors `my20fit_message_log` cycle stamps; identity stored only as keyed-HMAC `identity_hash` (no raw PII), deterministic `idempotency_key`; RLS on / 0 policy, relacl `{postgres, service_role}`, 22 cols / 4 checks. Applied + verified this session. **Local file `20260824160000` renamed to the ledger stamp `20260824145501`.**) |
> | 26 | `…20260824160306_crm_purge_audit_log_add_campaign_compliance` | `20260824160306` | `crm_purge_audit_log_add_campaign_compliance` (K-39 — adds the `campaign.%` compliance family to the purge denylist; a campaign send is outbound contact, not a file export, so it gets its OWN family, not `export.%`. create-or-replace; proacl `{postgres, service_role}`. Dry-run verified `campaign.sent` excluded from purge. Local file `20260824150000` renamed to the ledger stamp.) |
> | 27 | `…20260824160409_crm_segment` | `20260824160409` | `crm_segment` (K-40 — saved segment DEFINITIONS: validated criteria jsonb, NOT a member list; members recomputed on read; `requires_clinical` re-checked against the USING role's view_health. RLS on / 0 policy, relacl `{postgres, service_role}`, 8 cols / 0 rows. Applied + verified this session.) |
> | 28 | `…20260824180426_crm_campaign_run` | `20260824180426` | `crm_campaign_run` (K-41 form B — one row per campaign INSTANCE; its id becomes `crm_message_log.campaign_id` so each issue has its own deterministic idempotency keys (re-run = resume, new run = re-send). FK to `crm_segment` on delete restrict. RLS on / 0 policy, relacl `{postgres, service_role}`, 7 cols / 0 rows. Applied + verified this session. Local file `20260824170000` renamed to the ledger stamp.) |
> | 29 | `…20260825080504_crm_campaign_run_add_last_error` | `20260825080504` | `crm_campaign_run_add_last_error` (T-30 — adds `last_error text` so a run that HALTED before/without sending leaves a PII-free classified reason (status `stopped`), not silence. No new grants (UPDATE already held). Applied + verified this session; the two orphan draft runs from the 24→25 Aug internal-test attempts were retroactively marked `stopped` + `last_error`.) |
>
> **Count reconciliation (re-checked against `schema_migrations` on 2026-08-21): 22 CRM
> migration files on `main` → 24 CRM ledger entries in the DB.** The gap between files and
> ledger entries is **two** double-applies:
>
> - **+1** — migration **9** applied **twice** under the same name (Sprint 3H). The first
>   apply left Supabase's default `EXECUTE` grant to `anon`/`authenticated` in place (a
>   `revoke … from public` does **not** remove explicit per-role grants); the second apply
>   carried the corrected `revoke … from public, anon, authenticated`. `create or replace`
>   is idempotent, so both stamps point at the same two functions.
> - **+1** — migration **21** (`create_crm_upsert_profile_demographic`) applied **twice**: the
>   first apply (`…113452`) used `v_changed || 'gender'`, which Postgres resolves as `array_cat`
>   (→ "malformed array literal"); the re-apply (`…113649`) uses `array_append`. The FINAL
>   definition is the row-21 file; the `…113452` stamp is a superseded stamp only.
> - **Migrations 16, 17 & 18 came from a parallel session** (PR #13, branch
>   `claude/20fit-crm-sprint-1-67vvhs`): `add_is_fitco_member_matched_to_crm_customer_mirror`
>   adds a Fitco-membership flag to the mirror, `crm_norm_phone_guard_empty_nsn` fixes the
>   `crm_norm_phone('62')` empty-NSN edge (flagged in Sprint 5A), and
>   `precompute_dashboard_stats_at_refresh` (`20260818041017`) precomputes the dashboard stats at
>   refresh. **Their SQL files are now on `main`** — 16 & 17 pulled verbatim on 2026-08-19, and
>   **18 consolidated on 2026-08-21** (selective; its three function bodies md5-match the live
>   catalog). All already stamped in `schema_migrations`; the files are the repo record only — do
>   **not** re-apply. Verified against the live DB: the matview carries `is_fitco_member_matched`
>   (= 67,653 matched) at column 21, and `crm_norm_phone('62')` returns `null` (empty-NSN guard).
> - **Migration 22 (`pin_search_path_crm_audit_log_no_mutate`, `20260821041044`)** was applied this
>   session and consolidated the same day (2026-08-21) — it pins `search_path` on the append-only
>   guard `crm_audit_log_no_mutate`; both triggers verified still reject UPDATE+DELETE.
>
> **The ledger is now SHARED.** Other teams stamp into the same `schema_migrations` (e.g.
> `my20fit_*`, `clinic_*`, `arena_*`, `talent_*`, `event_*`) interleaved with CRM versions, so
> reconcile CRM migrations by **name filter**, never by version range.
>
> **Migration 8 is historical and is NOT edited.** Its `EXECUTE` was left open to
> `anon`/`authenticated` (the Supabase default); migration **10** revokes it — a separate
> file on purpose, so migration 8 stays a faithful record. See
> `docs/RISIKO-rpc-execute-terbuka.md`. Migration 10 must NOT be reverted (that reopens the
> hole).
>
> **Do NOT run `supabase db push` against this project until the ledger and repo are
> reconciled.** No repo file-name timestamp exists in the ledger, so the CLI would treat
> all **22** repo migrations as unapplied and try to run them all — re-creating the seven
> live tables + re-defining the live functions, failing as "already exists". Run any
> further migration one-by-one via a reviewed path (`apply_migration`), not `db push`.
>
> **Migration 11 (`crm_backfill_consent`) applied + run 2026-08-12.** It backfilled 408,119
> consent rows for the legacy import (marketing + transactional). Unlike a schema migration,
> its DATA is reversible and cheap to undo: `crm_consent` has **zero triggers**, so
> `delete from public.crm_consent where source = '20fit_data_import'` removes exactly the
> backfilled rows and nothing else. This is UNLIKE `crm_suppression` and `crm_audit_log`,
> which are append-only (triggers block mutation) and cannot be undone.

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
- Deploy: Railway (source = GitHub), **connected branch = `main`, auto-deploy on push**
  (confirmed in the Railway dashboard, Settings → Source, 2026-08-24). The 2026-08-12 claim that
  "branch code serves production" was **wrong** — it came from a `git log -S` on a stale
  `origin/main` ref (the audit-action commit had already merged to `main` via PR #10, minutes
  before the reset it pointed to). Withdrawn; see T-22 (corrected) and T-27 in
  `docs/riwayat/TEMUAN.md`. **Merge to `main` = deploy to production** — that is the single
  trigger, so the merge gate below matters more, not less.

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

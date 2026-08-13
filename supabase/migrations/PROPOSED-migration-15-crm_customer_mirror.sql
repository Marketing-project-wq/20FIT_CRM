-- ============================================================================================
-- PROPOSED migration 15 — crm_customer_mirror (Sprint 5A, TUGAS 2)  ·  NOT APPLIED — GATED
-- ============================================================================================
-- This file is a DRAFT for review. It is deliberately NOT named with a timestamp ledger prefix
-- and has NOT been applied. Per the sprint gate: show SQL, stop, wait for confirmation. Rename to
-- `<timestamp>_create_crm_customer_mirror.sql` and apply ONLY after sign-off.
--
-- WHY A MATERIALIZED VIEW, NOT A TABLE (evaluated, not assumed):
--   A table would need INSERT/UPDATE/DELETE sync logic kept consistent with six upstream tables —
--   exactly the kind of hand-maintained mechanism that drifts (see the last_activity_at lesson).
--   A matview replaces all of that with one REFRESH: the definition IS the sync rule, so there is
--   no second place for the mirror to disagree with source. The cost of a matview is (a) no RLS and
--   (b) a full recompute per refresh. (a) is handled by grants below; (b) is fine because this data
--   is slow-and-static (profile attrs, staging import, engagement counts) — the whole point.
--   => matview is the right shape here. A table would only win if we needed per-row incremental
--      updates, which we explicitly do NOT (consent/suppression, the only volatile data, are OUT).
--
-- SECURITY — THE PART MOST EASILY GOTTEN WRONG:
--   A materialized view does NOT honour RLS. Every crm_* protection so far leaned on "RLS ON, no
--   policy". For a matview the ONLY protection is GRANTS. If we skip the revoke/grant below we
--   publish a full copy of all profile PII readable by anyone holding the anon key — the exact
--   T-02 class we are escalating to the data owner. So the revoke + grant live in THIS file, right
--   next to the CREATE, and are non-optional.
--
-- WHAT IS IN THE MIRROR — only the slow + static:
--   profile: full_name, phone_normalized, email_normalized, city, first_unit, segment, lifetime_value
--   staging (matched by email): rfm, date_of_birth (parsed), age_computed, per-program flags
--   engagement: per-unit engagement_count (from customer_engagement)
--   source presence flags: in_hyrox, in_my20fit, in_arena, in_gym, in_clinic
--
-- WHAT IS DELIBERATELY OUT (see LARANGAN):
--   - consent + suppression  → volatile; a stale mirror would say "contactable" after a stop
--     request. Contactability stays LIVE via crm_contactable_counts (already fast).
--   - NIK, clinical data, other sensitive fields → the mirror is read by many screens; keeping
--     these out keeps the surface small. They stay read directly behind profile.view_health.
--
-- FRESHNESS MUST BE VISIBLE (not assumed): crm_mirror_meta stores the last refresh time; the UI
--   shows it. A snapshot that looks live is the last_activity_at trap in a new costume.
--
-- REFRESH is MANUAL, not scheduled (a separate decision, like purge). Function + a button for an
--   entitled role. REFRESH ... CONCURRENTLY needs a UNIQUE index and CANNOT run inside a
--   transaction — check whether apply_migration wraps statements (migration-12 lesson) before the
--   real apply; if it wraps, the CONCURRENTLY refresh call must run OUTSIDE the migration (the
--   migration creates the matview WITH DATA once; CONCURRENTLY is only for later refreshes via the
--   function, invoked outside a txn).
-- ============================================================================================

-- ── Freshness metadata (a plain table; one row) ────────────────────────────────────────────
create table if not exists public.crm_mirror_meta (
  id            boolean primary key default true check (id),   -- single-row guard
  refreshed_at  timestamptz not null default now(),
  row_count     bigint
);
insert into public.crm_mirror_meta (id, refreshed_at, row_count)
  values (true, now(), 0)
  on conflict (id) do nothing;

alter table public.crm_mirror_meta enable row level security;  -- RLS on, no policy (crm_* posture)
revoke all on public.crm_mirror_meta from public, anon, authenticated;
grant select, update on public.crm_mirror_meta to service_role;

-- ── The mirror ──────────────────────────────────────────────────────────────────────────────
-- NOTE FOR REVIEW: the profile + staging(email) + engagement joins below are the shape I am
-- confident of. The five source-presence sub-selects (in_hyrox …) reference the same tables the
-- read layers use (cf_hyrox_participants, my20fit_*, arena/gym/clinic source tables); their EXACT
-- table + match-column names must be confirmed against lib/crm/{enrichment,multisource,clinic-source}.ts
-- before apply. They are written as email/phone semi-joins matching those read layers.
create materialized view public.crm_customer_mirror as
select
  mc.customer_id,
  mc.full_name,
  mc.phone_normalized,
  mc.email_normalized,
  mc.city,
  mc.first_unit,
  mc.segment,
  mc.lifetime_value,
  -- staging import (same import as master, joined by normalised email; ~98.6% match)
  st.rfm                                   as staging_rfm,
  st.date_of_birth                         as staging_dob,       -- stored value; parse/flags stay in app
  -- per-unit engagement counts, pivoted from customer_engagement
  coalesce(eng.arena_count, 0)             as engagement_arena,
  coalesce(eng.clinic_count, 0)            as engagement_clinic,
  coalesce(eng.gym_count, 0)               as engagement_gym,
  coalesce(eng.event_count, 0)             as engagement_event,
  coalesce(eng.membership_count, 0)        as engagement_membership,
  -- source presence flags (email/phone semi-joins; see review note above for exact names)
  (mc.email_normalized in (select email_normalized from public.cf_hyrox_participants))  as in_hyrox,
  (mc.email_normalized in (select email_normalized from public.my20fit_profile))        as in_my20fit,
  -- in_arena / in_gym / in_clinic: confirm source table + key (email first, phone for clinic) then add
  false                                    as in_arena,   -- TODO(review): arena source semi-join
  false                                    as in_gym,     -- TODO(review): gym source semi-join
  false                                    as in_clinic   -- TODO(review): clinic phone-first semi-join
from public.master_customer mc
left join public.staging_20fit_data st
  on st.email_normalized = mc.email_normalized     -- confirm staging has a normalised-email column
left join (
  select customer_id,
    count(*) filter (where unit = 'arena')      as arena_count,
    count(*) filter (where unit = 'clinic')     as clinic_count,
    count(*) filter (where unit = 'gym')        as gym_count,
    count(*) filter (where unit = 'event')      as event_count,
    count(*) filter (where unit = 'membership') as membership_count
  from public.customer_engagement
  group by customer_id
) eng on eng.customer_id = mc.customer_id
with data;

-- ── UNIQUE index — REQUIRED for REFRESH ... CONCURRENTLY ─────────────────────────────────────
create unique index crm_customer_mirror_customer_id_uidx
  on public.crm_customer_mirror (customer_id);

-- Optional supporting indexes for the filters the pool/segment builder use:
create index crm_customer_mirror_first_unit_idx on public.crm_customer_mirror (first_unit);
create index crm_customer_mirror_segment_idx     on public.crm_customer_mirror (segment);
create index crm_customer_mirror_city_idx        on public.crm_customer_mirror (city);

-- ── GRANTS — the ONLY protection a matview has. Non-optional. ────────────────────────────────
revoke all on public.crm_customer_mirror from public, anon, authenticated;
grant select on public.crm_customer_mirror to service_role;

-- ── Manual refresh function (SECURITY DEFINER; EXECUTE locked to service_role, K-15 posture) ──
-- CONCURRENTLY keeps the mirror readable during refresh and needs the unique index above. It
-- cannot run inside a transaction block — call this function from a context that is NOT wrapped in
-- a txn (see apply_migration note at top).
create or replace function public.crm_refresh_customer_mirror()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
  n  bigint;
begin
  refresh materialized view concurrently public.crm_customer_mirror;
  ts := now();
  select count(*) into n from public.crm_customer_mirror;
  update public.crm_mirror_meta set refreshed_at = ts, row_count = n where id;
  return ts;
end;
$$;

revoke all on function public.crm_refresh_customer_mirror() from public, anon, authenticated;
grant execute on function public.crm_refresh_customer_mirror() to service_role;

-- ── EXECUTE-guard (Sprint 3I) note ──────────────────────────────────────────────────────────
-- The 3I guard test checks that crm_* FUNCTIONS do not leak EXECUTE to anon/authenticated. This
-- migration adds one such function (crm_refresh_customer_mirror) — it is already locked above and
-- should be ADDED to that guard's expected set. The guard does not currently cover matview SELECT
-- grants; consider extending it (or adding a sibling test) to assert crm_customer_mirror grants
-- exclude anon/authenticated, since a matview's grant is its only protection.

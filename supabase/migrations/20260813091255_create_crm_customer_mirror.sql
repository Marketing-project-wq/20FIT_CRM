-- ============================================================================================
-- Migration 15 — crm_customer_mirror (Sprint 5A, TUGAS 2)  ·  APPLIED 20260813091255
-- ============================================================================================
-- A read-side mirror of the slow-and-static customer facts, so the dashboard, /audience pool and
-- the segment builder read one pre-joined table instead of re-running the profile + staging +
-- engagement + five source-presence joins on every request. Applied after data-owner sign-off
-- (BALASAN — Jalankan Migrasi 15). All eleven reference numbers were verified equal to the live
-- read paths before and after apply (see README ledger + the sprint report).
--
-- WHY A MATERIALIZED VIEW, NOT A TABLE (evaluated, not assumed):
--   A table would need INSERT/UPDATE/DELETE sync logic kept consistent with the upstream tables —
--   exactly the kind of hand-maintained mechanism that drifts (the last_activity_at lesson). A
--   matview replaces all of that with one REFRESH: the definition IS the sync rule, so there is no
--   second place for the mirror to disagree with source. Its costs are (a) no RLS and (b) a full
--   recompute per refresh. (a) is handled by grants below; (b) is fine — this data is slow-and-
--   static (profile attrs, staging import, engagement counts), which is the whole reason to mirror
--   it. A table would only win if we needed per-row incremental updates, which we explicitly do NOT
--   (consent/suppression, the only volatile data, are OUT — see below).
--
-- SECURITY — grants are the ONLY protection a matview has:
--   A materialized view does NOT honour RLS. Every crm_* protection so far leaned on "RLS ON, no
--   policy"; that lever does not exist for a matview. So the revoke + grant live in THIS file, next
--   to the CREATE, and are non-optional. Without them we would publish a full copy of profile PII
--   readable by anyone holding the anon key. Verified after apply: crm_customer_mirror and
--   crm_mirror_meta are readable by {postgres, service_role} only — anon/authenticated/PUBLIC are
--   absent. The EXECUTE guard test was extended to assert this matview's SELECT grants directly.
--
-- WHAT IS IN THE MIRROR — only the slow + static:
--   profile:    full_name, phone_normalized, email_normalized, city, first_unit, segment,
--               lifetime_value
--   staging:    rfm, dob (matched by normalised email; raw values — parse/age stay in the app)
--   engagement: per-unit counts pivoted from customer_engagement
--   presence:   has_hyrox, has_my20fit, has_arena, has_gym, has_clinic (email/phone semi-joins
--               against the same source tables the read layers use)
--
-- WHAT IS DELIBERATELY OUT (LARANGAN):
--   - consent + suppression → volatile; a stale mirror would say "contactable" after a stop
--     request. Contactability stays LIVE via crm_contactable_counts (already fast).
--   - NIK / clinical detail / other sensitive fields → the mirror is read by many screens; keeping
--     these out keeps the exposed surface small. has_clinic is a boolean presence flag only — no
--     clinical record, patient id, or diagnosis crosses into the mirror.
--
-- FRESHNESS IS VISIBLE (not assumed): crm_mirror_meta stores the last refresh time + row count and
--   the UI shows it. A snapshot that looks live is the last_activity_at trap in a new costume.
--
-- REFRESH is MANUAL, not scheduled (a separate decision, like purge): the function below plus a
--   button for an entitled role. It uses a NON-CONCURRENT refresh on purpose — REFRESH ...
--   CONCURRENTLY cannot run inside a function/transaction, and the data-owner constraint requires
--   crm_mirror_meta to be updated in the SAME unit of work as the refresh. A plain REFRESH inside
--   the SECURITY DEFINER function gives us that atomicity (meta can never disagree with the data)
--   at the cost of a brief lock during recompute — an acceptable trade for a manual, low-frequency
--   refresh. The UNIQUE index below is kept so a future operator can switch to CONCURRENTLY from an
--   out-of-transaction context if the lock ever matters.
-- ============================================================================================

-- ── Phone canonicaliser (K-06 parity: '62' || nsn) ──────────────────────────────────────────
-- Matches normalizePhoneID: strip spaces/()/./-, drop a leading + or 00, then map a leading 62 or
-- trunk 0 to canonical 62. Digits-only guard returns null for anything non-numeric. IMMUTABLE so it
-- can be used inside the matview definition. EXECUTE locked to service_role (crm_* posture).
create or replace function public.crm_norm_phone(raw text)
returns text language sql immutable set search_path = public as $$
  select case when d ~ '^[0-9]+$'
              then '62' || case when d like '62%' then substr(d, 3)
                                when d like '0%'  then substr(d, 2)
                                else d end
              else null end
  from (
    select regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(raw, ''), '[[:space:]().-]', '', 'g'),
             '^\+', ''),
           '^00', '') as d
  ) x;
$$;
revoke all on function public.crm_norm_phone(text) from public, anon, authenticated;
grant execute on function public.crm_norm_phone(text) to service_role;

-- ── The mirror ──────────────────────────────────────────────────────────────────────────────
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
  -- staging import (joined by normalised email; deduped max() per email — only 36 dup emails)
  st.rfm                            as staging_rfm,
  st.dob                            as staging_dob,
  -- per-unit engagement counts, pivoted from customer_engagement
  coalesce(eng.arena_count, 0)      as engagement_arena,
  coalesce(eng.clinic_count, 0)     as engagement_clinic,
  coalesce(eng.gym_count, 0)        as engagement_gym,
  coalesce(eng.event_count, 0)      as engagement_event,
  coalesce(eng.membership_count, 0) as engagement_membership,
  -- source-presence flags (semi-joins against the same tables the read layers use)
  (mc.email_normalized is not null and mc.email_normalized in (
     select lower(btrim(email)) from cf_hyrox_participants where email is not null
  )) as has_hyrox,
  (mc.email_normalized is not null and mc.email_normalized in (
     select lower(btrim(email)) from my20fit_profile where email is not null
  )) as has_my20fit,
  (mc.email_normalized is not null and mc.email_normalized in (
     select lower(btrim(email)) from arena_class_bookings where email is not null
     union select lower(btrim(email)) from arena_bookings       where email is not null
     union select lower(btrim(email)) from arena_package_orders where email is not null
     union select lower(btrim(email)) from arena_members        where email is not null
  )) as has_arena,
  (mc.email_normalized is not null and mc.email_normalized in (
     select lower(btrim(email)) from gym_class_bookings     where email is not null
     union select lower(btrim(email)) from gym_memberships       where email is not null
     union select lower(btrim(email)) from gym_membership_orders where email is not null
  )) as has_gym,
  -- clinic: phone-first, email-fallback (matches the clinic read layer). Phone side uses the
  -- K-06 canonicaliser so it agrees with phone_normalized (verified: 112 phone-or-email).
  ((mc.phone_normalized is not null and mc.phone_normalized in (
      select public.crm_norm_phone(phone) from clinic_patients where phone is not null
   ))
   or
   (mc.email_normalized is not null and mc.email_normalized in (
      select lower(btrim(email)) from clinic_patients
      where email is not null and email like '%@%'
   ))) as has_clinic
from public.master_customer mc
left join (
  select lower(btrim("Email"))          as em,
         max("RFM per paid order")      as rfm,
         max("Tgl / Tahun lahir")       as dob
  from public.staging_20fit_data
  where "Email" is not null and btrim("Email") <> ''
  group by lower(btrim("Email"))
) st on st.em = mc.email_normalized
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

-- ── UNIQUE index — kept so a future operator can switch to REFRESH ... CONCURRENTLY ───────────
create unique index crm_customer_mirror_customer_id_uidx
  on public.crm_customer_mirror (customer_id);

-- Supporting indexes for the filters the pool / segment builder use:
create index crm_customer_mirror_first_unit_idx on public.crm_customer_mirror (first_unit);
create index crm_customer_mirror_segment_idx     on public.crm_customer_mirror (segment);
create index crm_customer_mirror_city_idx        on public.crm_customer_mirror (city);

-- ── GRANTS — the ONLY protection a matview has. Non-optional. ────────────────────────────────
revoke all on public.crm_customer_mirror from public, anon, authenticated;
grant select on public.crm_customer_mirror to service_role;

-- ── Freshness metadata (a plain table; one row) ────────────────────────────────────────────
create table if not exists public.crm_mirror_meta (
  id            boolean primary key default true check (id),   -- single-row guard
  refreshed_at  timestamptz not null default now(),
  row_count     bigint
);
alter table public.crm_mirror_meta enable row level security;  -- RLS on, no policy (crm_* posture)
revoke all on public.crm_mirror_meta from public, anon, authenticated;
grant select, update on public.crm_mirror_meta to service_role;

insert into public.crm_mirror_meta (id, refreshed_at, row_count)
  values (true, now(), (select count(*) from public.crm_customer_mirror))
  on conflict (id) do update
    set refreshed_at = excluded.refreshed_at,
        row_count    = excluded.row_count;

-- ── Manual refresh function (SECURITY DEFINER; EXECUTE locked to service_role, K-15 posture) ──
-- NON-CONCURRENT refresh, on purpose: it lets the meta UPDATE run in the same transaction as the
-- REFRESH, so crm_mirror_meta can never disagree with the data. CONCURRENTLY cannot run in a
-- function/txn, and here atomic freshness matters more than avoiding the brief recompute lock.
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
  refresh materialized view public.crm_customer_mirror;
  ts := now();
  select count(*) into n from public.crm_customer_mirror;
  update public.crm_mirror_meta set refreshed_at = ts, row_count = n where id;
  return ts;
end;
$$;

revoke all on function public.crm_refresh_customer_mirror() from public, anon, authenticated;
grant execute on function public.crm_refresh_customer_mirror() to service_role;

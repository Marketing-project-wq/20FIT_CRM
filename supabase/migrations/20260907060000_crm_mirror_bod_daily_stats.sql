-- ============================================================================================
-- BOD daily snapshot — add four keys to crm_mirror_meta.dashboard_stats. GATED, NOT YET APPLIED.
-- --------------------------------------------------------------------------------------------
-- WHY THIS EXISTS (K-61). The board screen must be readable as ONE statement: a single "data as of"
-- line covering every card. Today four of its five cards are counted at request time and only the
-- business-unit card comes from this daily blob, so the page carries two freshness claims. The
-- decision was to make the WHOLE page a daily snapshot — timestamp consistency is the feature, and
-- the per-unit COUNT(DISTINCT) RPC that would have gone the other way is CANCELLED, not parked.
--
-- The owner's first framing of that decision was "zero exceptions, zero RPC, zero migration". The
-- last third was wrong, and this file is the measurement of it (T-59): the blob is written by
-- public.crm_refresh_customer_mirror() (cron `crm-refresh-customer-mirror`, `0 20 * * *` = 03:00
-- WIB), and it carries only engagement / rfm / fitco / ecosystem / sources / candidates. Reach,
-- load history, delivery health and the CRM gap have no daily source at all. Giving them one means
-- changing this function, which is a gated migration. Hence this file, and hence the page was NOT
-- relabelled "as of 03:00" in the meantime: four cards counted seconds ago under a line claiming
-- 03:00 would be one sentence precisely false about the data beneath it — the exact failure K-60
-- exists to end, committed deliberately. It waits for the gate instead.
--
-- STRICTLY ADDITIVE. The six existing keys — ecosystem, engagement, fitco, rfm, sources,
-- candidates — are reproduced BYTE-FOR-BYTE from the live definition (read via pg_get_functiondef,
-- 7 Sep 2026). Their CTEs (mir, rfmb, fitco, cand) are untouched. Four new keys are appended:
-- reach, loads, delivery, not_in_crm. Every existing reader keeps reading exactly what it read.
--
-- FOUR DECISIONS INSIDE THIS FILE, each of which could have gone wrong silently:
--
-- 1. `not_in_crm` does NOT reuse the existing `candidates` key, even though that key is right
--    there and free. `candidates` counts a DIFFERENT population: crm_identity_candidate spans
--    event_transaction (1,887), rc_ticket_invites, uob_users and more — tables absent from the
--    five sources the board card names. Reusing it would change what the number means while
--    leaving the title alone. That is the failure class this whole sprint has been closing, so
--    the five-source computation is done here from scratch (T-59).
--
-- 2. Suppression is resolved with `lifted_at is null`, NOT `status = 'active'`. crm_suppression
--    carries both columns and today they agree — but on exactly ONE row, which proves nothing.
--    The application layer (lib/crm/bod.ts) uses `lifted_at is null`, and a figure that must match
--    what the app computes has to use the app's predicate. One rule, one implementation: the same
--    discipline that phone canon, the retention list and the export each learned the hard way.
--
-- 3. `loads` reads created_at, NEVER first_seen_at. Measured 7 Sep 2026: created_at yields 3
--    distinct days, first_seen_at yields 163. They are different clocks (K-19) — created_at is
--    when the row was written HERE (every row of a load shares the microsecond, because a load is
--    one bulk insert), first_seen_at is when the origin system first saw the person. Charting the
--    second would draw 163 bars of a history this CRM never lived through and would hide the one
--    fact the chart exists to show.
--
-- 4. Reach counts PEOPLE (rows of master_customer), not consent rows. With migration 37 applied,
--    crm_consent is about to hold two bases for the first time (all 408,119 rows today are
--    legacy_import_unverified; csv_import will write explicit_opt_in), so anything counting consent
--    ROWS would start double-counting a person who ends up with both. This function never reads
--    crm_consent at all — consent is evidence, not a reach gate (K-36).
--
-- PERFORMANCE, MEASURED NOT ASSUMED (explain analyze on production, 7 Sep 2026):
--   reach, first attempt   — 1,601 ms. `not exists (select 1 from sup ...)` planned as a CTE Scan
--                            re-executed 163,894 times, once per candidate row.
--   reach, as written here —    53 ms. A hash LEFT JOIN against the (tiny) suppression set.
--   not_in_crm             —   166 ms. Hash anti-join on email_normalized; clinic is 280 rows.
--   loads + delivery       — folded into the same scans, tens of ms.
-- The function already does `refresh materialized view concurrently`, which dominates everything
-- here. This is a nightly job; the added work is not close to a concern.
--
-- WIDENS WHAT THIS FUNCTION READS — say it out loud. Until now it read crm_* tables, the mirror and
-- one staging table. `not_in_crm` needs the SOURCE systems (my20fit_profile, cf_hyrox_participants,
-- arena_*, gym_*, clinic_patients), because the gap is source-minus-pool and the mirror holds only
-- pool rows — its has_* flags mark people who ARE matched and can never express who is missing. All
-- reads, aggregate only: what leaves this function is a count, never an identity.
--
-- ROLLBACK (restores the exact definition read from pg_get_functiondef on 7 Sep 2026 — the six
-- original keys, no new ones):
--   Re-run the previous body. It is preserved verbatim in
--   docs/riwayat/ROLLBACK-crm_refresh_customer_mirror-20260907.sql so the rollback is a file to
--   run, not a paragraph to reconstruct under pressure.
-- After a rollback the BOD page must go back to per-card timestamps in the same deploy — a page
-- claiming one daily stamp over keys that no longer exist would show em dashes under a confident
-- headline.
-- ============================================================================================

create or replace function public.crm_refresh_customer_mirror()
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ts    timestamptz;
  n     bigint;
  stats jsonb;
begin
  refresh materialized view concurrently public.crm_customer_mirror;
  ts := now();

  with mir as (
    select
      count(*)                                              as total,
      count(*) filter (where has_hyrox)                     as e_hyrox,
      count(*) filter (where has_my20fit)                   as e_my20fit,
      count(*) filter (where has_arena)                     as e_arena,
      count(*) filter (where has_gym)                       as e_gym,
      count(*) filter (where has_clinic)                    as e_clinic,
      count(*) filter (where has_event_txn)                 as e_event_txn,
      count(*) filter (where has_ticket_participant)        as e_ticket,
      count(*) filter (where has_my20fit_buyer)             as e_my20fit_buyer,
      count(*) filter (where has_uob)                       as e_uob,
      count(*) filter (where has_rc_participant)            as e_rc_participant,
      count(*) filter (where has_clinic_booking)            as e_clinic_booking,
      count(*) filter (where engagement_arena      > 0)     as g_arena,
      count(*) filter (where engagement_clinic     > 0)     as g_clinic,
      count(*) filter (where engagement_gym        > 0)     as g_gym,
      count(*) filter (where engagement_event      > 0)     as g_event,
      count(*) filter (where engagement_membership > 0)     as g_membership,
      count(*) filter (where is_fitco_member_matched)       as fitco_matched,
      count(*) filter (where staging_rfm is null or staging_rfm = '-') as rfm_tanpa
    from public.crm_customer_mirror
  ),
  rfmb as (
    select coalesce(
      jsonb_agg(jsonb_build_object('label', label, 'count', c) order by c desc, label),
      '[]'::jsonb
    ) as buckets
    from (
      select staging_rfm as label, count(*) as c
      from public.crm_customer_mirror
      where staging_rfm is not null and staging_rfm <> '-'
      group by staging_rfm
    ) g
  ),
  fitco as (
    select
      count(*)                                                                    as staging_rows,
      count(distinct lower(btrim("Email"))) filter
        (where "Email" is not null and btrim("Email") <> '')                      as staging_unique
    from public.staging_20fit_data
    where "Fitco User" = 'Fitco User'
  ),
  cand as (
    select
      coalesce(sum(c), 0)::bigint                             as total,
      coalesce(jsonb_object_agg(source_table, c), '{}'::jsonb) as by_source
    from (
      select source_table, count(*) as c
      from public.crm_identity_candidate
      group by source_table
    ) s
  ),

  -- ── NEW ─────────────────────────────────────────────────────────────────────────────────
  -- Card 1 · reach. LEFT JOIN, not a correlated NOT EXISTS: see the performance note above.
  -- Suppression maps to customer_id, not to a channel, so ONE unsubscribe removes the person from
  -- both counts. That is what the code does today and this reproduces it faithfully rather than
  -- quietly improving it — the ambiguity is recorded as T-57 and belongs to the owner, not here.
  sup as (
    select distinct customer_id
      from public.crm_suppression
     where lifted_at is null and customer_id is not null
  ),
  reach as (
    select
      count(*) filter (where m.email_normalized is not null and s.customer_id is null) as emailable,
      count(*) filter (where m.phone_normalized is not null and s.customer_id is null) as whatsappable,
      count(*)                                                                          as pool_total
    from public.master_customer m
    left join sup s on s.customer_id = m.customer_id
  ),
  -- DISTINCT people the provider has ever ACCEPTED a message for. A bounce belongs here (the
  -- provider did take it); `failed` does not (it never left). People, not rows: 128 accepted rows
  -- covered 126 people on 7 Sep 2026.
  ever as (
    select count(distinct customer_id) as ever_contacted
      from public.crm_message_log
     where status in ('sent', 'delivered', 'bounced') and customer_id is not null
  ),

  -- Card 2 · load history. One entry per distinct created_at — see decision 3 above.
  loads as (
    select coalesce(
      jsonb_agg(jsonb_build_object('at', at, 'count', c) order by at), '[]'::jsonb
    ) as arr
    from (
      select created_at as at, count(*) as c
        from public.master_customer
       where created_at is not null
       group by created_at
    ) z
  ),

  -- Card 4 · delivery health. Send OUTCOMES (rows), plus the two standing queues. `failed` is kept
  -- on the card deliberately: a screen showing only the delivered count would repeat the very
  -- error this sprint opened on — a run that failed 18,119 times filed as `sent` (T-42).
  deliv as (
    select
      count(*) filter (where status = 'delivered') as delivered,
      count(*) filter (where status = 'bounced')   as bounced,
      count(*) filter (where status = 'failed')    as failed
    from public.crm_message_log
  ),
  unsub as (
    select count(*) as n from public.crm_suppression where lifted_at is null
  ),
  wfq as (
    select count(*) as n from public.crm_workflow_enrollment where status = 'queued'
  ),

  -- Card 5 · not in the CRM yet. FIVE sources, keyed exactly as lib/crm/dashboard-sources.ts keys
  -- them: email-keyed sources dedup on trim+lower(email); clinic is phone-first OR email (K-06).
  -- Reported as DISTINCT PEOPLE, never as the sum of per-source gaps — someone in two systems
  -- would be counted twice, and the operational screen's own caption already forbids that sum.
  -- The phone canon below mirrors normalizePhoneID in lib/crm/normalize.ts: strip separators, drop
  -- one leading '+', drop a leading '00', require digits, then reduce to the national number and
  -- re-prefix 62.
  src_email as (
    select email from public.my20fit_profile
    union all select email from public.cf_hyrox_participants
    union all select email from public.arena_class_bookings
    union all select email from public.arena_bookings
    union all select email from public.arena_package_orders
    union all select email from public.arena_members
    union all select email from public.gym_class_bookings
    union all select email from public.gym_memberships
    union all select email from public.gym_membership_orders
  ),
  e as (
    select distinct lower(btrim(email)) as ek
      from src_email
     where email is not null and lower(btrim(email)) like '%@%'
  ),
  e_gap as (
    select ek from e
     where not exists (select 1 from public.master_customer m where m.email_normalized = e.ek)
  ),
  craw as (
    select lower(btrim(email)) as ek_raw,
           regexp_replace(coalesce(phone, ''), '[\s\-().]', '', 'g') as p0
      from public.clinic_patients
  ),
  ccanon as (
    select
      case when ek_raw <> '' and ek_raw like '%@%' then ek_raw end as ek,
      case when p1 ~ '^[0-9]+$' and p1 <> '' then
        '62' || case when p1 like '62%' then substr(p1, 3)
                     when p1 like '0%'  then substr(p1, 2)
                     else p1 end
      end as pk
    from (select ek_raw, case when p0 like '+%' then substr(p0, 2) else p0 end as pa from craw) a,
         lateral (select case when pa like '00%' then substr(pa, 3) else pa end as p1) b
  ),
  cpeople as (select distinct pk, ek from ccanon),
  -- Clinic people not in the pool AND not already counted on the email side. A clinic person known
  -- only by phone who is the same human as an email elsewhere is counted twice — nothing links
  -- them — so this figure is an UPPER BOUND on distinct humans, and the tighter of the two
  -- available bounds. That caveat lives on the card, not only here.
  c_extra as (
    select count(*) as n
      from cpeople s
     where not (
             (s.pk is not null and exists (select 1 from public.master_customer m where m.phone_normalized = s.pk))
          or (s.ek is not null and exists (select 1 from public.master_customer m where m.email_normalized = s.ek))
        )
       and (s.ek is null or not exists (select 1 from e_gap g where g.ek = s.ek))
  )
  select
    mir.total,
    jsonb_build_object(
      'ecosystem', jsonb_build_object(
        'hyrox', mir.e_hyrox, 'my20fit', mir.e_my20fit, 'arena', mir.e_arena,
        'gym', mir.e_gym, 'clinic', mir.e_clinic
      ),
      'engagement', jsonb_build_object(
        'arena', mir.g_arena, 'clinic', mir.g_clinic, 'gym', mir.g_gym,
        'event', mir.g_event, 'membership', mir.g_membership
      ),
      'fitco', jsonb_build_object(
        'matched',        mir.fitco_matched,
        'staging_rows',   fitco.staging_rows,
        'staging_unique', fitco.staging_unique,
        'unmatched',      fitco.staging_unique - mir.fitco_matched
      ),
      'rfm', jsonb_build_object(
        'tanpa',   mir.rfm_tanpa,
        'buckets', rfmb.buckets
      ),
      'sources', jsonb_build_object(
        'event_txn',          jsonb_build_object('matched', mir.e_event_txn),
        'ticket_participant', jsonb_build_object('matched', mir.e_ticket),
        'my20fit_buyer',      jsonb_build_object('matched', mir.e_my20fit_buyer),
        'uob',                jsonb_build_object('matched', mir.e_uob),
        'rc_participant',     jsonb_build_object('matched', mir.e_rc_participant),
        'clinic_booking',     jsonb_build_object('matched', mir.e_clinic_booking)
      ),
      'candidates', jsonb_build_object(
        'total',     cand.total,
        'by_source', cand.by_source
      ),
      -- ── the four new keys ──────────────────────────────────────────────────────────────
      'reach', jsonb_build_object(
        'emailable',      reach.emailable,
        'whatsappable',   reach.whatsappable,
        'pool_total',     reach.pool_total,
        'ever_contacted', ever.ever_contacted
      ),
      'loads', loads.arr,
      'delivery', jsonb_build_object(
        'delivered',       deliv.delivered,
        'bounced',         deliv.bounced,
        'failed',          deliv.failed,
        'unsubscribed',    unsub.n,
        'workflow_queued', wfq.n
      ),
      'not_in_crm', jsonb_build_object(
        'distinct_people', (select count(*) from e_gap) + c_extra.n
      )
    )
  into n, stats
  from mir, rfmb, fitco, cand, reach, ever, loads, deliv, unsub, wfq, c_extra;

  update public.crm_mirror_meta
     set refreshed_at    = ts,
         row_count       = n,
         dashboard_stats = stats
   where id;

  return ts;
end;
$function$;

-- EXECUTE lock, self-contained in this file (the migration-execute-guard rule). This is a REPLACE
-- of a function that already exists and is already locked — measured 7 Sep 2026, its acl is
-- {postgres=X/postgres, service_role=X/postgres}: anon false, authenticated false, public false,
-- service_role true — and `create or replace` preserves an existing function's privileges rather
-- than re-running Supabase's default grant. So these two statements change nothing today; they are
-- here because the guard's rule is that a migration creating a crm_* function must be readable on
-- its own, without the reader having to know which functions predate it. Re-stating the lock costs
-- nothing and removes a question.
revoke all on function public.crm_refresh_customer_mirror() from public, anon, authenticated;
grant execute on function public.crm_refresh_customer_mirror() to service_role;

-- ROLLBACK for supabase/migrations/20260907060000_crm_mirror_bod_daily_stats.sql
--
-- This is the definition of public.crm_refresh_customer_mirror() EXACTLY as it stood in production
-- before that migration, read from pg_get_functiondef() on 7 Sep 2026 and reproduced verbatim.
-- Running this file restores the six-key blob (ecosystem, engagement, fitco, rfm, sources,
-- candidates) and drops the four added keys (reach, loads, delivery, not_in_crm).
--
-- IF YOU RUN THIS, ALSO REVERT THE BOD PAGE IN THE SAME DEPLOY. The page reads the four new keys
-- and, once they exist, carries a single daily "data as of" line. Rolling back the function alone
-- leaves a confident headline above em dashes.
--
-- The blob is fully rewritten on every run, so the next cron tick (`0 20 * * *`) restores the
-- six-key shape on its own; running this file just makes it immediate.

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
      )
    )
  into n, stats
  from mir, rfmb, fitco, cand;

  update public.crm_mirror_meta
     set refreshed_at    = ts,
         row_count       = n,
         dashboard_stats = stats
   where id;

  return ts;
end;
$function$;

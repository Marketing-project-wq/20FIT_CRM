-- Backfill legacy NULL campaign names so they stop reading "Unnamed" in Delivery History and are
-- traceable. Resume runs are excluded from name validation, so these rows could never be named via the
-- UI — a one-time data fix is the only route. Fills label / run_label with the app's human default
-- ("{segment} · {DD Mon YYYY}", WIB, Indonesian month abbrev, NEVER an ISO timestamp) PLUS the WIB
-- HH:MM of created_at — the time is appended to EVERY backfilled row (not just clashing ones) so the
-- data is consistent, and it keeps 6 same-segment/same-day legacy runs distinct before the column goes
-- NOT NULL. This time suffix is BACKFILL-ONLY; it does NOT change defaultCampaignLabel for new
-- campaigns (those names are operator-required now).
--
-- IDEMPOTENT: every UPDATE is guarded by "IS NULL", so re-running touches nothing already named. Rows
-- with no resolvable segment get a "Kampanye · date time" fallback (still human). The produced 9 values
-- were reviewed by the owner before applying (see PR / README ledger).

do $$
declare mon text[] := array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
begin
  -- crm_campaign_run: segment-resolved name + created_at date & time (WIB)
  update crm_campaign_run r
  set label =
    coalesce(nullif(trim(s.name), ''), 'Kampanye') || ' · '
    || extract(day   from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (r.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || to_char((r.created_at at time zone 'Asia/Jakarta'), 'HH24:MI')
  from crm_segment s
  where r.label is null and s.id = r.segment_id;

  -- crm_campaign_run: any remaining NULLs (no resolvable segment) → human fallback, still never ISO
  update crm_campaign_run r
  set label = 'Kampanye · '
    || extract(day   from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (r.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || to_char((r.created_at at time zone 'Asia/Jakarta'), 'HH24:MI')
  where r.label is null;

  -- crm_scheduled_send: same rule on run_label (created_at date & time, WIB)
  update crm_scheduled_send ss
  set run_label =
    coalesce(nullif(trim(s.name), ''), 'Kampanye') || ' · '
    || extract(day   from (ss.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (ss.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (ss.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || to_char((ss.created_at at time zone 'Asia/Jakarta'), 'HH24:MI')
  from crm_segment s
  where ss.run_label is null and s.id = ss.segment_id;

  update crm_scheduled_send ss
  set run_label = 'Kampanye · '
    || extract(day   from (ss.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (ss.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (ss.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || to_char((ss.created_at at time zone 'Asia/Jakarta'), 'HH24:MI')
  where ss.run_label is null;
end $$;

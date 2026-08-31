-- Backfill legacy NULL campaign names so they stop reading "Unnamed" in Delivery History and are
-- traceable. Resume runs are excluded from name validation, so these rows could never be named via the
-- UI — a one-time data fix is the only route. Fills label / run_label with the SAME human default the
-- app uses (defaultCampaignLabel): "{segment} · {DD Mon YYYY}" in WIB, Indonesian month abbrev, NEVER
-- an ISO timestamp.
--
-- IDEMPOTENT: every UPDATE is guarded by "IS NULL", so re-running touches nothing already named, and a
-- row named after this migration is left alone. Rows with no resolvable segment get a "Kampanye · date"
-- fallback (still human).
--
-- Preview of the 9 rows this produces was reviewed before applying (see PR description / README ledger).

do $$
declare mon text[] := array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
begin
  -- crm_campaign_run: segment-resolved name + created_at date (WIB)
  update crm_campaign_run r
  set label =
    coalesce(nullif(trim(s.name), ''), 'Kampanye') || ' · '
    || extract(day   from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (r.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (r.created_at at time zone 'Asia/Jakarta'))::int
  from crm_segment s
  where r.label is null and s.id = r.segment_id;

  -- crm_campaign_run: any remaining NULLs (no resolvable segment) → human fallback, still never ISO
  update crm_campaign_run r
  set label = 'Kampanye · '
    || extract(day   from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (r.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (r.created_at at time zone 'Asia/Jakarta'))::int
  where r.label is null;

  -- crm_scheduled_send: same rule on run_label (created_at date, WIB)
  update crm_scheduled_send ss
  set run_label =
    coalesce(nullif(trim(s.name), ''), 'Kampanye') || ' · '
    || extract(day   from (ss.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (ss.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (ss.created_at at time zone 'Asia/Jakarta'))::int
  from crm_segment s
  where ss.run_label is null and s.id = ss.segment_id;

  update crm_scheduled_send ss
  set run_label = 'Kampanye · '
    || extract(day   from (ss.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (ss.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (ss.created_at at time zone 'Asia/Jakarta'))::int
  where ss.run_label is null;
end $$;

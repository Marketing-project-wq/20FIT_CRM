-- One-time cleanup of 3 legacy campaign names that carry a raw ISO timestamp:
--   "UJI kirim internal 2026-08-25T07:41:40.318Z"  (and two siblings)
-- These are NOT the scheduled-send cron artifact (that was one row, already fixed) — they came from the
-- OLD manual composer's auto-generated name (segment name + ISO stamp), created 25 Aug 2026 by a real
-- operator BEFORE the composer dropped auto-generate and made the name mandatory. That write path is
-- dead, so no new rows like this can appear; these 3 are frozen historical rows. Left as-is, Delivery
-- History would show two naming conventions with no visible reason — the exact inconsistency the
-- backfill removed. Rewrite them to the SAME human default the 9 backfilled rows use:
-- "{segment} · {DD Mon YYYY} {HH:MM}" (Asia/Jakarta WIB, Indonesian month abbrev, from created_at).
--
-- SCOPED + IDEMPOTENT: touches ONLY these 3 ids, and only while the label still matches the ISO shape
-- (`~ '\d{4}-\d{2}-\d{2}T'`), so a re-run after the fix is a no-op. Owner reviewed the 3 produced values
-- before applying (see PR #24 / README ledger). No column/type change; data-only.

do $$
declare mon text[] := array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
begin
  update crm_campaign_run r
  set label =
    coalesce(nullif(trim(s.name), ''), 'Kampanye') || ' · '
    || extract(day   from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || mon[extract(month from (r.created_at at time zone 'Asia/Jakarta'))::int] || ' '
    || extract(year  from (r.created_at at time zone 'Asia/Jakarta'))::int || ' '
    || to_char((r.created_at at time zone 'Asia/Jakarta'), 'HH24:MI')
  from crm_segment s
  where s.id = r.segment_id
    and r.id in (
      '7eb5ddb7-9de4-4259-ada7-b074f42a1452',
      'ade3fb47-6f45-4566-8f23-ba31af1b2d2f',
      '232a5d50-9fc7-4a14-8615-2c3d2d1e11f2'
    )
    and r.label ~ '\d{4}-\d{2}-\d{2}T';  -- guard: only rewrite while still an ISO-shaped label
end $$;

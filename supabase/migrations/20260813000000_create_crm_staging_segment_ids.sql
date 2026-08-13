-- Migration 14: staging_20fit_data → master_customer segment resolver.
--
-- WHY: the app resolved a staging criterion (RFM bucket / program participation) to master
-- customer_ids in TWO phases over PostgREST — page ~82k staging emails, then chunk-match to
-- master via .in() — ~330 sequential round-trips = tens of seconds for a big criterion (e.g.
-- RFM 'New User' = 81,213 rows). Measured 13 Agu 2026: the SAME work as ONE SQL semi-join is
-- ~0.33s warm. PostgREST cannot express this join (no FK between the tables), so a function is
-- the only reasonable fix. This is the hard blocker for segment export (Sprint 4A TUGAS 1).
--
-- READ-ONLY: writes nothing. SECURITY DEFINER only so the join runs under service_role's grants
-- (same posture as migrations 9/11/13). EXECUTE locked to service_role (K-15 / Sprint 3I guard).
--
-- SHAPE: EXISTS semi-join, measured faster than a DISTINCT-join (330ms vs 370ms warm) and needs
-- no DISTINCT (one row per master by construction). Two explicit branches — with / without a
-- program filter — so the query never references a program column when none was asked for.
--
-- SAFETY: p_program_column is validated against a CLOSED 28-entry allowlist before it can reach
-- format(%I); p_rfm is a bound parameter ($1), never interpolated. No injection surface.
--
-- Result parity verified 13 Agu 2026 vs the old resolver: New User 74,021, Fitco User 67,653.

create or replace function public.crm_staging_segment_ids(
  p_rfm text default null,
  p_program_column text default null
)
returns table (customer_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'Fitco User','Sportfest v.02 Half','Sportfest v.02 Relay','Sportfest v.02 Double',
    'Sportfest v.02 Single','Training Session','Physio or Sports Massage','Protection',
    'Pasien 20FIT Clinic 2024-2025','Pasien 20FIT Clinic 2025-2026','Paid Shop','Arena','GYM',
    'Padel rabel','Jhm 2025 - 5k','Jhm 2025 - 10K','Jhm 2025 - HM','Jhm 2024 - 5k',
    'Jhm 2024 - 10K','Jhm 2024 - HM','Iwhm 2025 - 5k','Iwhm 2025 - 10k','Iwhm 2025 - 21k',
    'Raya run 2025 - 5k','Raya run 2025 - 10k','Mandiri RUNFEST 2.7K','Mandiri RUNFEST 5K',
    'Mandiri RUNFEST 10K'
  ];
begin
  -- Branch 1: no program filter (RFM-only, or fully unfiltered). Static query.
  if p_program_column is null then
    return query
      select m.customer_id
      from public.master_customer m
      where m.customer_id is not null
        and exists (
          select 1
          from public.staging_20fit_data s
          where lower(btrim(s."Email")) = m.email_normalized
            and (p_rfm is null or s."RFM per paid order" = p_rfm)
        );
    return;
  end if;

  -- Branch 2: program filter. Validate the identifier against the closed allowlist FIRST.
  if not (p_program_column = any(v_allowed)) then
    raise exception 'invalid program column: %', p_program_column;
  end if;

  return query execute format($q$
    select m.customer_id
    from public.master_customer m
    where m.customer_id is not null
      and exists (
        select 1
        from public.staging_20fit_data s
        where lower(btrim(s."Email")) = m.email_normalized
          and ($1 is null or s."RFM per paid order" = $1)
          and s.%1$I is not null
          and btrim(s.%1$I) <> ''
          and btrim(s.%1$I) <> '-'
      )
  $q$, p_program_column)
  using p_rfm;
end;
$$;

revoke all on function public.crm_staging_segment_ids(text, text) from public, anon, authenticated;
grant execute on function public.crm_staging_segment_ids(text, text) to service_role;

-- crm_segment — saved segment DEFINITIONS (criteria), not results (K-40). Stores the validated
-- filter criteria; members are recomputed on read (never a frozen customer_id list → never misses
-- suppression). RLS ON / 0 policy / grants service_role ONLY (crm_* pattern). requires_clinical is
-- set at save time; the view_health gate is re-checked on USE by the using role, so a saved segment
-- cannot smuggle a clinical criterion past the gate.
-- APPLIED 20260824160409: RLS on, 0 policy, relacl {postgres, service_role}, 8 cols, 0 rows.
-- README ledger row 27.
create table if not exists public.crm_segment (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  criteria          jsonb not null,                 -- validated filter tree (not SQL); revalidated on read
  requires_clinical boolean not null default false, -- criteria touch srcClinicPatient/srcClinicTxn (view_health)
  created_by        text,                           -- actor (email/id) — in-row provenance
  created_at        timestamptz not null default now(),
  is_active         boolean not null default true,  -- soft-archive; no DELETE of a definition ever used
  updated_at        timestamptz
  -- NO member_count (recomputed on view, with a freshness marker)
  -- NO customer_id list (freezing the pool would miss suppression)
  -- NO time criteria (K-19)
);

comment on table public.crm_segment is
  'Saved segment DEFINITIONS (criteria jsonb), not member lists. Members recomputed on read. requires_clinical is re-checked against the USING role''s view_health on use, not the creator''s. K-40 (3M updated, not cancelled).';

create index if not exists crm_segment_active_idx on public.crm_segment (is_active, created_at desc);

alter table public.crm_segment enable row level security;

revoke all on public.crm_segment from public, anon, authenticated;
grant select, insert, update on public.crm_segment to service_role;

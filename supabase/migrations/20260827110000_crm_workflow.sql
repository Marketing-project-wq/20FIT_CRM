-- ============================================================================================
-- MIGRASI 29 · Workflow marketing (crm_workflow + crm_workflow_enrollment)
-- --------------------------------------------------------------------------------------------
-- TUJUAN: workflow terjadwal (welcome series / re-engagement) di atas lapisan aktivitas Fase 1-2.
-- Trigger berbasis kriteria waktu NYATA (crm_customer_activity): welcome = joined_at ≤ N hari,
-- re-engagement = last_active_at ≥ N hari. Engine harian meng-enroll profil yang match + belum
-- enrolled, lalu kirim lewat jalur sendCampaign yang ADA (hormati suppression + gate + audit).
--
-- POLA: mengikuti crm_segment (K-40) + crm_campaign_run (K-41). RLS ON, 0 policy, service_role.
-- IDEMPOTEN: unique (workflow_id, customer_id) → satu orang tak di-enroll dua kali ke workflow
-- yang sama (cegah kirim ganda welcome). Enrollment append-only; status maju queued→sent→failed.
-- ============================================================================================

-- §1 · Definisi workflow. trigger_days = ambang hari; type menentukan arti (welcome vs reeng).
create table if not exists public.crm_workflow (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null check (type in ('welcome', 'reengagement')),
  trigger_days  integer not null check (trigger_days >= 1 and trigger_days <= 3650),
  template_key  text not null,
  is_active     boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now()
);

alter table public.crm_workflow enable row level security;
revoke all on public.crm_workflow from public, anon, authenticated;
grant select, insert, update on public.crm_workflow to service_role;

-- §2 · Enrollment — satu baris per (workflow, customer). Unique cegah enroll ganda (idempoten).
create table if not exists public.crm_workflow_enrollment (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.crm_workflow(id) on delete cascade,
  customer_id  uuid not null,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  enrolled_at  timestamptz not null default now(),
  sent_at      timestamptz,
  campaign_run_id uuid,
  constraint crm_workflow_enrollment_uniq unique (workflow_id, customer_id)
);

create index if not exists crm_workflow_enrollment_wf_idx
  on public.crm_workflow_enrollment (workflow_id, status);

alter table public.crm_workflow_enrollment enable row level security;
revoke all on public.crm_workflow_enrollment from public, anon, authenticated;
grant select, insert, update on public.crm_workflow_enrollment to service_role;

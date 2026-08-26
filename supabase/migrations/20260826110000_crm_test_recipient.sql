-- crm_test_recipient — internal @20fit.id addresses for pre-launch send testing.
-- Only @20fit.id addresses accepted (enforced in application code + check constraint).
-- RLS ON / 0 policy / grants to service_role ONLY (crm_* pattern).
-- Append-only in spirit (soft-delete via is_active=false) for auditability.
create table if not exists public.crm_test_recipient (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  label       text,
  is_active   boolean not null default true,
  added_by    text,
  added_at    timestamptz not null default now(),
  constraint  crm_test_recipient_email_unique unique (email),
  constraint  crm_test_recipient_internal_only
    check (email ilike '%@20fit.id')
);

alter table public.crm_test_recipient enable row level security;
revoke all on public.crm_test_recipient from public, anon, authenticated;
grant select, insert, update on public.crm_test_recipient to service_role;

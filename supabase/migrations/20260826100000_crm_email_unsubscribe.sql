-- crm_email_unsubscribe — tracks email unsubscribe events for analytics.
-- One ROW per (email, template_id) unsubscribe. No UPDATE or DELETE — immutable log (K-14 spirit).
-- RLS ON / 0 policy / grants to service_role ONLY (crm_* pattern).
create table if not exists public.crm_email_unsubscribe (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  template_id     uuid references public.crm_message_template(id),
  unsubscribed_at timestamptz not null default now(),
  user_agent      text,
  ip_address      inet,
  constraint crm_email_unsubscribe_email_template_unique unique (email, template_id)
);

create index if not exists crm_email_unsubscribe_email_idx
  on public.crm_email_unsubscribe (email);

create index if not exists crm_email_unsubscribe_template_idx
  on public.crm_email_unsubscribe (template_id);

alter table public.crm_email_unsubscribe enable row level security;

revoke all on public.crm_email_unsubscribe from public, anon, authenticated;
grant select, insert on public.crm_email_unsubscribe to service_role;

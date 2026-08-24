-- crm_message_template — message templates (contacting-half TUGAS 2).
-- One ROW per (template_key, language, version). A new version is a new INSERT (full version
-- history); "current" = the highest version per key+language. No UPDATE of content, no DELETE —
-- what a campaign used yesterday must stay readable as-it-was (K-14 spirit).
-- RLS ON / 0 policy / grants to service_role ONLY (crm_* pattern, like crm_mirror_meta).
-- Applied + verified 2026-08-24 (ledger 20260824135604): RLS on, 0 policy,
-- relacl {postgres, service_role}, 14 cols, 7 check constraints, 0 rows. README ledger row 24.
create table if not exists public.crm_message_template (
  id                      uuid primary key default gen_random_uuid(),
  template_key            text not null,
  channel                 text not null check (channel in ('email','whatsapp')),
  language                text not null check (language in ('id','en')),
  version                 integer not null check (version >= 1),
  name                    text not null,
  subject                 text,
  body                    text not null,
  variables               text[] not null default '{}',
  wa_approval_status      text not null default 'not_applicable'
    check (wa_approval_status in ('not_applicable','draft','pending','approved','rejected')),
  wa_provider_template_id text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  created_by              text,
  constraint crm_tpl_email_has_subject
    check (channel <> 'email' or subject is not null),
  constraint crm_tpl_wa_no_subject
    check (channel <> 'whatsapp' or subject is null),
  constraint crm_tpl_email_wa_status
    check (channel <> 'email' or wa_approval_status = 'not_applicable'),
  constraint crm_message_template_key_lang_version_unique unique (template_key, language, version)
);

create index if not exists crm_message_template_key_lang_idx
  on public.crm_message_template (template_key, language, version desc);

alter table public.crm_message_template enable row level security;

revoke all on public.crm_message_template from public, anon, authenticated;
grant select, insert on public.crm_message_template to service_role;

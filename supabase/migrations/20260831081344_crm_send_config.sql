-- Configurable send limits (owner request): daily ceiling + workflow sub-cap, editable by Super
-- Admin, audited. Singleton row (id always true). The cap-≤-limit rule is enforced in the DB so a
-- bad edit can never persist. crm_* pattern: RLS on / 0 policy / grants to service_role only.
--
-- Applied + verified 2026-08-31 (ledger 20260831081344): row {daily_limit 1000, workflow_daily_cap
-- 300}, 4 check constraints, RLS on, 0 policy, grants {postgres, service_role} only. Replaces the
-- hard-coded DEFAULT_SEND_CONFIG.dailyLimit=1000 / workflow cap=300 with a stored, auditable value.
create table if not exists public.crm_send_config (
  id                  boolean primary key default true,
  daily_limit         integer not null default 1000,
  workflow_daily_cap  integer not null default 300,
  updated_by          text,
  updated_at          timestamptz not null default now(),
  constraint crm_send_config_singleton      check (id = true),
  constraint crm_send_config_daily_positive check (daily_limit > 0),
  constraint crm_send_config_wf_positive    check (workflow_daily_cap > 0),
  constraint crm_send_config_cap_le_limit   check (workflow_daily_cap <= daily_limit)
);

-- Seed the single row with today's defaults (1000 / 300 — the values previously hard-coded).
insert into public.crm_send_config (id) values (true) on conflict (id) do nothing;

comment on table public.crm_send_config is
  'Singleton send-limit config: daily_limit (system daily ceiling) + workflow_daily_cap (sub-cap for '
  'automated workflow sends, must be <= daily_limit). Editable by Super Admin, audited. Replaces the '
  'hard-coded DEFAULT_SEND_CONFIG.dailyLimit=1000 / workflow cap=300.';

alter table public.crm_send_config enable row level security;
revoke all on public.crm_send_config from public, anon, authenticated;
grant select, insert, update on public.crm_send_config to service_role;

-- crm_message_log — one ROW per send ATTEMPT to one recipient (contacting-half, send path).
-- Mirrors my20fit_message_log's send-cycle schema (verified column-by-column against the live
-- table) but KEYED ON customer_id (master_customer), not my20fit's user_id — the CRM pool is not
-- covered by that key (K-37 #1). RLS ON / 0 policy / grants to service_role ONLY (crm_* pattern,
-- like crm_message_template). INSERT at send; UPDATE only for provider webhook cycle stamps
-- (delivered/opened/bounced/…) — message content is never UPDATEd.
--
-- TWO CORRECTIONS from review (24 Aug 2026):
--  1. NO RAW IDENTITY. This table grows one row per send and is read by the Messages screen and
--     never pruned — storing the raw email/phone would make it a second, plaintext copy of the
--     contact list and a masking backdoor. So the destination is stored ONLY as identity_hash
--     (keyed HMAC-SHA256, domain-separated), which is enough to CORRELATE/MATCH (bounce, "did we
--     ever message this address") but not to READ. "To whom" is answered by customer_id, which
--     resolves through the existing view_contact masking. identity_hash is never exported and
--     never rendered.
--  2. IDEMPOTENCY IS DETERMINISTIC. idempotency_key must be a pure function of the campaign, the
--     recipient, and the channel so that RE-RUNNING an interrupted send regenerates the SAME keys
--     and the unique index skips already-sent recipients. A per-attempt random key would defeat
--     the unique index entirely. The exact form is documented in the column comment below.
--
-- Applied + verified 2026-08-24 (ledger 20260824145501): RLS on, 0 policy, relacl {postgres,
-- service_role}, 22 cols, 4 check constraints, 0 rows. README ledger row 25.
create table if not exists public.crm_message_log (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null,                 -- CRM key (master_customer.customer_id), not user_id
  channel              text not null check (channel in ('email','whatsapp')),
  campaign_id          text,                           -- send-run id (text, mirrors my20fit; null = ad-hoc)
  template_key         text,                           -- template + version ACTUALLY sent →
  template_version     integer,                        --   "what the person actually received"
  identity_hash        text,                           -- keyed HMAC of the normalized destination (NO raw PII)
  subject              text,                           -- email only
  language             text check (language in ('id','en')),
  idempotency_key      text not null,                  -- deterministic; see column comment
  provider_message_id  text,                           -- id returned by Mailtrap / Meta
  status               text not null default 'queued'
    check (status in ('queued','sent','delivered','bounced','complained','failed','skipped_suppressed')),
  failure_cause        text                            -- differentiated cause for status in (failed,bounced)
    check (failure_cause is null or failure_cause in
      ('invalid_address','hard_bounce','provider_rejected','daily_limit','unknown')),
  error_message        text,                           -- provider error detail (PII-free), optional
  -- Send-cycle timestamps (mirrored from my20fit_message_log; filled by provider webhooks):
  sent_at              timestamptz,
  delivered_at         timestamptz,
  opened_at            timestamptz,
  clicked_at           timestamptz,
  bounced_at           timestamptz,
  complained_at        timestamptz,
  unsubscribed_at      timestamptz,
  created_at           timestamptz not null default now(),
  constraint crm_message_log_idem_unique unique (idempotency_key)
);

comment on table public.crm_message_log is
  'One row per send attempt to one recipient, keyed on customer_id. Destination stored only as '
  'identity_hash (keyed HMAC, no raw PII). INSERT at send; UPDATE only for provider webhook cycle stamps.';

comment on column public.crm_message_log.idempotency_key is
  'DETERMINISTIC: format is {campaign_id}:{customer_id}:{channel} (see lib/crm/send-run.ts '
  'buildIdempotencyKey). Because it is derived purely from the campaign, recipient, and channel, '
  're-running an interrupted send regenerates the same keys and the unique index skips recipients '
  'already sent. It is NEVER randomized per attempt — that would defeat the unique index.';

comment on column public.crm_message_log.identity_hash is
  'Keyed HMAC-SHA256 of the normalized destination (email/phone), domain-separated. Enough to '
  'match a bounced address or answer "did we message this identity", NOT to read it. Raw contact '
  'is never stored here; "to whom" is customer_id (masked via view_contact). Never exported/rendered.';

create index if not exists crm_message_log_customer_idx on public.crm_message_log (customer_id);
create index if not exists crm_message_log_campaign_idx on public.crm_message_log (campaign_id);
create index if not exists crm_message_log_status_idx   on public.crm_message_log (status);
-- Daily-limit counting reads today's rows by created_at; a partial index keeps that count cheap.
create index if not exists crm_message_log_created_idx  on public.crm_message_log (created_at);

alter table public.crm_message_log enable row level security;

revoke all on public.crm_message_log from public, anon, authenticated;
grant select, insert, update on public.crm_message_log to service_role;

import "server-only";
import { Pool, type PoolClient } from "pg";

/**
 * Partnership database — the "Postgres" service inside the CRM Railway project, reached over the
 * private network (PARTNER_DATABASE_URL = ${{Postgres.DATABASE_URL}}). The schema is created on first
 * use (idempotent DDL); there is no separate migration step for this database.
 */

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export const partnerDbConfigured = () => !!process.env.PARTNER_DATABASE_URL;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.PARTNER_DATABASE_URL;
    if (!url) throw new Error("PARTNER_DATABASE_URL belum diset");
    pool = new Pool({ connectionString: url, max: 6, idleTimeoutMillis: 30_000, statement_timeout: 30_000 });
  }
  return pool;
}

const SCHEMA = `
create table if not exists p_lead (
  id bigserial primary key,
  company text not null,
  category text not null default 'unknown',
  products text[] not null default '{}',
  stage text not null default 'lead',
  value_estimate numeric,
  owner_email text,
  source text not null default 'manual',
  priority text not null default 'normal',
  city text,
  website text,
  notes text,
  lost_reason text,
  tags text[] not null default '{}',
  autopilot boolean not null default true,
  needs_human boolean not null default false,
  handoff_reason text,
  stage_before_ghost text,
  followup_count int not null default 0,
  next_action_at timestamptz,
  next_action text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  summary text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists p_contact (
  id bigserial primary key,
  lead_id bigint not null references p_lead(id) on delete cascade,
  name text, title text, phone text, email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists p_contact_phone on p_contact(phone);
create index if not exists p_contact_email on p_contact(lower(email));
create table if not exists p_conversation (
  id bigserial primary key,
  lead_id bigint not null references p_lead(id) on delete cascade,
  contact_id bigint references p_contact(id) on delete set null,
  channel text not null check (channel in ('wa','email')),
  external_id text,
  subject text,
  mode text not null default 'auto' check (mode in ('auto','manual')),
  manual_until timestamptz,
  unread int not null default 0,
  last_message_at timestamptz,
  last_preview text,
  created_at timestamptz not null default now()
);
create unique index if not exists p_conversation_ext on p_conversation(channel, external_id) where external_id is not null;
create table if not exists p_message (
  id bigserial primary key,
  conversation_id bigint not null references p_conversation(id) on delete cascade,
  lead_id bigint not null,
  direction text not null check (direction in ('in','out')),
  author text not null,
  body text,
  html text,
  attachments jsonb not null default '[]',
  external_id text,
  status text not null default 'sent',
  error text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists p_message_ext on p_message(conversation_id, external_id) where external_id is not null;
create index if not exists p_message_conv on p_message(conversation_id, created_at);
create table if not exists p_meeting (
  id bigserial primary key,
  lead_id bigint not null references p_lead(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  kind text not null default 'online' check (kind in ('online','offline')),
  location text,
  meet_url text,
  google_event_id text,
  status text not null default 'scheduled' check (status in ('proposed','scheduled','done','no_show','cancelled')),
  attendees jsonb not null default '[]',
  notes text,
  outcome text,
  reminded_24h boolean not null default false,
  reminded_1h boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists p_meeting_start on p_meeting(start_at);
create table if not exists p_activity (
  id bigserial primary key,
  lead_id bigint references p_lead(id) on delete cascade,
  kind text not null,
  title text not null,
  detail jsonb not null default '{}',
  actor text not null default 'system',
  at timestamptz not null default now()
);
create index if not exists p_activity_lead on p_activity(lead_id, at desc);
create index if not exists p_activity_at on p_activity(at desc);
create table if not exists p_task (
  id bigserial primary key,
  lead_id bigint not null references p_lead(id) on delete cascade,
  conversation_id bigint references p_conversation(id) on delete set null,
  kind text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','running','done','cancelled','failed')),
  attempts int not null default 0,
  payload jsonb not null default '{}',
  result text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists p_task_due on p_task(due_at) where status = 'pending';
create table if not exists p_kb (
  id bigserial primary key,
  title text not null,
  product text not null default 'umum',
  content text not null,
  active boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);
create table if not exists p_setting (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists p_webhook_raw (
  id bigserial primary key,
  source text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed boolean not null default false,
  error text
);
`;

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const c = await getPool().connect();
      try {
        await c.query("select pg_advisory_lock(424242)");
        await c.query(SCHEMA);
      } finally {
        await c.query("select pg_advisory_unlock(424242)").catch(() => undefined);
        c.release();
      }
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const r = await getPool().query(text, params);
  return r.rows as T[];
}

export async function q1<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const c = await getPool().connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

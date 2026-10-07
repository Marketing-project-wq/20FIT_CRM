-- Event registry — admin-curated grouping for Event Analysis (/analytics/events).
--
-- WHY: Event Analysis currently groups event:* tags AUTOMATICALLY by slug prefix
-- (lib/crm/event-analytics.ts → eventGroupKey). That heuristic splits what is really
-- one event into several ("ISS JHR 2026" vs "ISS JHR Day") and cannot be corrected by
-- an operator. This registry lets an admin define events explicitly and assign the
-- audience tags that belong to each, so grouping is curated, not guessed.
--
-- Two tables:
--   crm_event_registry        — one row per real event (name, slug, description, date)
--   crm_event_registry_tags   — which event:* tags belong to each event (many-to-one)
--
-- crm_* convention: RLS ON, ZERO policies, NO grants to anon/authenticated — read &
-- write ONLY via the service_role (the admin client). Same posture as crm_tag_registry
-- and crm_segment. The app never touches these tables with the user's anon client.
--
-- ─────────────────────────────────────────────────────────────────────────────────
-- RUN THIS MANUALLY in the Supabase SQL Editor. It is intentionally NOT applied by the
-- app or by CI. The seed (events pre-populated from today's prefix grouping) is a
-- SEPARATE, review-first script: sql/20261007_seed_crm_event_registry.sql.
-- ─────────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_event_registry (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                         -- "ISS x JHR 2026"
  slug        text not null unique,                  -- "iss-jhr-2026" (URL / reference)
  description text,                                  -- optional
  event_date  date,                                  -- optional, for sorting
  is_active   boolean not null default true,         -- soft-hide without deleting mappings
  created_by  text,                                  -- actor email/id — in-row provenance
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crm_event_registry_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]*$')
);

comment on table public.crm_event_registry is
  'Admin-curated events for Event Analysis grouping. One row per real event. Tags that '
  'belong to an event live in crm_event_registry_tags. Service_role only (crm_* pattern).';

-- Mapping: event → audience tags (event:* slugs on master_customer.tags / engagement).
create table if not exists public.crm_event_registry_tags (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.crm_event_registry(id) on delete cascade,
  tag_slug   text not null,                          -- "event:iss-jhr-2026", "event:iss-jhr-day-fri-11sep", …
  created_at timestamptz not null default now(),
  constraint crm_event_registry_tags_unique unique (event_id, tag_slug),
  -- A tag may belong to AT MOST ONE event (grouping must be unambiguous). The global
  -- UNIQUE on tag_slug enforces that across all events, not just within one event.
  constraint crm_event_registry_tags_slug_global_unique unique (tag_slug),
  constraint crm_event_registry_tags_slug_format check (tag_slug ~ '^event:[a-z0-9][a-z0-9-]*$')
);

comment on table public.crm_event_registry_tags is
  'Maps a curated event (crm_event_registry) to the event:* audience tags it owns. A tag '
  'belongs to at most one event (global UNIQUE on tag_slug). Service_role only.';

-- Fast lookup in both directions.
create index if not exists idx_event_registry_tags_event on public.crm_event_registry_tags(event_id);
create index if not exists idx_event_registry_tags_slug  on public.crm_event_registry_tags(tag_slug);

-- RLS ON, zero policies — service_role bypasses RLS, everyone else is denied.
alter table public.crm_event_registry       enable row level security;
alter table public.crm_event_registry_tags  enable row level security;

revoke all on public.crm_event_registry      from public, anon, authenticated;
revoke all on public.crm_event_registry_tags from public, anon, authenticated;

grant select, insert, update, delete on public.crm_event_registry      to service_role;
grant select, insert, update, delete on public.crm_event_registry_tags to service_role;

-- updated_at bump on crm_event_registry edits (keeps "last changed" honest for sorting/UX).
create or replace function public.crm_event_registry_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_event_registry_set_updated_at on public.crm_event_registry;
create trigger crm_event_registry_set_updated_at
  before update on public.crm_event_registry
  for each row execute function public.crm_event_registry_touch_updated_at();

revoke all on function public.crm_event_registry_touch_updated_at() from public, anon, authenticated;

-- Tag registry: operator tags as first-class entities with metadata. Tags are currently only stored
-- as text[] on master_customer, so there is no way to annotate a tag (show/hide in charts, label
-- override, ordering) or to offer autocomplete from a known vocabulary. This table is the registry.
--
-- The slug column is the canonical tag string (e.g. "event:iss-jhr-2026") — the same format stored
-- on master_customer.tags. A UNIQUE constraint guarantees no duplicates. The namespace is extracted
-- and stored for fast filtering.
--
-- crm_* pattern: RLS ON, zero policies, no grants to anon/authenticated, only service_role/postgres.

create table if not exists public.crm_tag_registry (
  id              bigint generated always as identity primary key,
  slug            text not null,
  namespace       text not null,
  label           text,
  show_in_event_spread boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint crm_tag_registry_slug_unique unique (slug),
  constraint crm_tag_registry_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$'),
  constraint crm_tag_registry_ns_match   check (namespace = split_part(slug, ':', 1))
);

comment on table public.crm_tag_registry is
  'Registry of operator tags with metadata (label, show_in_event_spread). Slug is the canonical '
  'tag string stored on master_customer.tags. One row per distinct tag value.';

alter table public.crm_tag_registry enable row level security;
revoke all on public.crm_tag_registry from public, anon, authenticated;
grant select, insert, update, delete on public.crm_tag_registry to service_role;
grant usage on sequence crm_tag_registry_id_seq to service_role;

-- Seed from existing tags on master_customer. Only operator-namespace tags (the 8 known namespaces).
-- show_in_event_spread defaults true for event: and kategori: (the two namespaces the Event Spread
-- chart already shows), false for everything else.
insert into public.crm_tag_registry (slug, namespace, show_in_event_spread)
select distinct t.tag,
       split_part(t.tag, ':', 1),
       split_part(t.tag, ':', 1) in ('event', 'kategori')
from master_customer m, unnest(m.tags) as t(tag)
where t.tag ~ '^(event|format|kategori|nilai|peran|produk|sumber|tipe):[a-z0-9][a-z0-9-]*$'
on conflict (slug) do nothing;

-- Update crm_tag_event_counts to JOIN on the registry and respect show_in_event_spread.
-- This replaces the original function from migration 20260911100000.
create or replace function public.crm_tag_event_counts()
returns table(tag text, people bigint)
language sql stable security definer
set search_path = public
as $$
  select t.tag, count(*) as people
  from master_customer m, unnest(m.tags) as t(tag)
  inner join crm_tag_registry r on r.slug = t.tag and r.show_in_event_spread = true
  group by t.tag
  order by people desc;
$$;

comment on function public.crm_tag_event_counts() is
  'Dashboard Event Spread: distinct people per tag where show_in_event_spread = true. '
  'JOINs crm_tag_registry so toggling the flag controls chart visibility. Read-only, service_role only.';

revoke all on function public.crm_tag_event_counts() from public, anon, authenticated;
grant execute on function public.crm_tag_event_counts() to service_role;

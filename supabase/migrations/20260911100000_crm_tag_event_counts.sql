-- Tag-based event counts for the Dashboard "Event Spread" chart.
-- The chart already shows registrations per event product from customer_engagement; this RPC adds
-- events known only through CRM tags (event: and kategori: namespaces) on master_customer.tags.
-- A paged client-side scan would touch all ~82K rows; unnest + GROUP BY is one efficient query.

create or replace function public.crm_tag_event_counts()
returns table(tag text, people bigint)
language sql stable security definer
set search_path = public
as $$
  select t.tag, count(*) as people
  from master_customer m, unnest(m.tags) as t(tag)
  where t.tag like 'event:%' or t.tag like 'kategori:%'
  group by t.tag
  order by people desc;
$$;

comment on function public.crm_tag_event_counts() is
  'Dashboard Event Spread: distinct people per event:/kategori: tag. Read-only, service_role only.';

revoke all on function public.crm_tag_event_counts() from public, anon, authenticated;
grant execute on function public.crm_tag_event_counts() to service_role;

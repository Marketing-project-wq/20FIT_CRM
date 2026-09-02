-- ============================================================================================
-- CSV audience import — the service-role-only write path (Fase 1).
-- --------------------------------------------------------------------------------------------
-- Mirrors crm_ingest_activity_people (migrasi 28): a SECURITY DEFINER function, EXECUTE granted to
-- service_role ONLY, that inserts genuinely-new people into master_customer with the safe columns.
-- The difference is the SOURCE: rows come from a parsed CSV (jsonb array), not from live source tables.
--
-- OWNER DECISIONS (2026-09-02):
--  - Rows are DIRECTLY CONTACTABLE (K-36: consent is not a gate; unsubscribe/suppression is). The
--    import moves data whose consent was given at the collection point; it does NOT land as
--    legacy_import_unverified (that framing stays for imports of genuinely-unknown provenance — see
--    docs/RENCANA-ingest-ticket.md correction dated 2026-09-02).
--  - Each inserted person gets a crm_consent row with basis='opt_in' + evidence jsonb (source, batch,
--    uploaded_by, filename via collection_source) — EVIDENCE, not a gate. This is why, if ever asked
--    "why was this person emailed", the answer is in the data, not in someone's memory.
--  - Dedup is SKIP-ONLY (email OR phone already in master → not inserted). No overwrite, no fill-blanks.
--  - Suppression is untouched: a suppressed identity re-imported is still filtered at send (suppression
--    is keyed by normalized identity, resolved via phone_normalized/email_normalized).
--
-- SAFE COLUMNS ONLY (Fase 0 honored): full_name, email(+normalized), phone_normalized, city, source,
-- tags, first_seen_at. NOT imported here: NIK, DOB, gender, health — they need their own legal basis.
--
-- NORMALIZATION: the app normalizes through lib/crm/normalize.ts (canon phone 62… no +, email
-- trim+lower) BEFORE calling; the values arrive as email_normalized / phone_normalized. This function
-- trusts that canon (parity-guarded by crm-norm-phone.parity.test) and only guards the basic shape.
--
-- PENANDA & ROLLBACK: source='csv_import' + tags=['csv_import','batch:<uuid>'] mark every row. To undo
-- a batch (ready-to-use, shown to the owner in the PR):
--   -- 1) remove the consent-evidence rows for the batch
--   delete from public.crm_consent
--    where source='csv_import' and evidence->>'batch' = '<BATCH_UUID>';
--   -- 2) remove the imported people (check merged_into first — a merged row moved its data elsewhere)
--   delete from public.master_customer
--    where source='csv_import' and tags @> array['batch:<BATCH_UUID>'] and merged_into is null;
--   -- 3) refresh the read mirror
--   select public.crm_refresh_customer_mirror();
--
-- IDEMPOTENT: anti-join on email_normalized/phone_normalized — re-running the same file inserts nothing
-- already present. Phone conflicts (against master OR within the batch) null the phone rather than fail.
--
-- NOTE: this migration only CREATES the function. It runs NO import — the import happens on demand,
-- gated behind the app's audience.import permission (super_admin), reviewed row-by-row by the operator.
-- ============================================================================================

create or replace function public.crm_ingest_csv_people(
  p_rows jsonb,
  p_batch_id uuid,
  p_collection_source text,
  p_uploaded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with input as (
    select
      nullif(trim(r->>'full_name'), '')                  as full_name,
      nullif(trim(r->>'email'), '')                      as email_raw,
      lower(nullif(trim(r->>'email_normalized'), ''))    as ek,
      nullif(trim(r->>'phone_normalized'), '')           as pk,
      nullif(trim(r->>'city'), '')                       as city
    from jsonb_array_elements(p_rows) r
  ),
  -- Shape guard (defence in depth): a usable normalized email is required; a phone, if present, must
  -- be the canon 62… form. Anything else is dropped here, never inserted malformed.
  valid as (
    select * from input
     where ek is not null and ek like '%@%'
       and (pk is null or pk ~ '^62[0-9]+$')
  ),
  -- Skip anyone already in master by email OR phone (dedup = skip-only).
  new_people as (
    select v.* from valid v
     where not exists (select 1 from public.master_customer m where m.email_normalized = v.ek)
       and (v.pk is null or not exists (select 1 from public.master_customer m where m.phone_normalized = v.pk))
  ),
  -- One row per email within the batch (keep the most complete).
  deduped as (
    select distinct on (ek) full_name, email_raw, ek, pk, city
      from new_people
     order by ek, (pk is not null) desc, (full_name is not null) desc
  ),
  -- Null a phone that collides (with master, or with another batch row) — master has a unique index on
  -- phone_normalized; better a profile without a phone than a failed insert or a stolen identity.
  phone_safe as (
    select
      full_name, email_raw, ek, city,
      case
        when pk is null then null
        when exists (select 1 from public.master_customer m where m.phone_normalized = pk) then null
        when count(*) over (partition by pk) > 1 then null
        else pk
      end as pk
    from deduped
  ),
  ins as (
    insert into public.master_customer
      (full_name, email, email_normalized, phone_normalized, city,
       source, tags, first_seen_at, created_at, updated_at)
    select
      full_name, email_raw, ek, pk, city,
      'csv_import', array['csv_import', 'batch:' || p_batch_id::text], now(), now(), now()
    from phone_safe
    returning customer_id
  )
  -- Consent EVIDENCE (basis opt_in), one row per inserted person. Not a gate — proof of provenance.
  insert into public.crm_consent
    (customer_id, channel, purpose, basis, status, source, evidence, recorded_at, updated_at)
  select
    i.customer_id, 'email', 'marketing', 'opt_in', 'active', 'csv_import',
    jsonb_build_object(
      'source', 'csv_import',
      'batch', p_batch_id::text,
      'uploaded_by', p_uploaded_by::text,
      'collection_source', p_collection_source
    ),
    now(), now()
  from ins i;

  get diagnostics n = row_count; -- = number of consent rows = number of people inserted
  return jsonb_build_object('inserted', n);
end $$;

revoke all on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid) to service_role;

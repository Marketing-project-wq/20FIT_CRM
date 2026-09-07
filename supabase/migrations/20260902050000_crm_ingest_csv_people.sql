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
--  - Each inserted person gets a crm_consent row with basis='explicit_opt_in' + evidence jsonb (source,
--    batch, uploaded_by, filename via collection_source) — EVIDENCE, not a gate. This is why, if ever
--    asked "why was this person emailed", the answer is in the data, not in someone's memory.
--    'explicit_opt_in' is one of the TWO values crm_consent_basis_check accepts (the other is
--    'legacy_import_unverified'). The short name 'opt_in' stood here until 3 Sep 2026 and does NOT
--    exist in the schema — see T-48. Do not widen the CHECK to admit it.
--  - Dedup is EMAIL-PRIMARY, SKIP-ONLY (K-57): an email match is skipped; a phone-only match is inserted
--    with its colliding phone nulled (phone_safe below). No overwrite, no fill-blanks.
--  - TAGS (TUGAS A/B). Tags are PER ROW, not per batch: even inside one event file the rows differ
--    (format:single vs format:double, kategori:laki-laki vs perempuan, three nilai: bands). A
--    batch-level array cannot express that, so each row of p_rows carries its own `tags`, and
--    p_tag_rows carries {email, tags} for the people who are tagged instead of imported. The shape
--    rule is the SAME regex as OPERATOR_TAG_REGEX_SOURCE in lib/crm/tags.ts, compared character for
--    character by tags.parity.test.ts. An invalid tag FAILS THE CALL — never dropped, never partially
--    applied. Two markers, and the difference between them prevents a deletion:
--      new person      → 'csv_import' + 'batch:<id>' + operator tags
--      existing person → 'tagged:<id>'               + operator tags   (ONLY the tags column)
--    A per-batch rollback DELETES on `batch:`. Give an existing customer `batch:<id>` and this
--    happens with every guard intact: someone inserted by batch B1 (source='csv_import') who is
--    re-tagged by B2 would carry batch:B1 AND batch:B2, so rolling back B2 deletes a person who
--    belongs to B1. `tagged:` makes that impossible by SHAPE, not by remembering a WHERE clause.
--  - WHO GETS TAGGED: rows whose EMAIL matches an existing person — p_tag_emails, decided by the
--    planner, not re-derived here. A phone-only match is a DIFFERENT PERSON under K-57: they are
--    INSERTED, and the existing phone-owner is NOT tagged (they never entered the event). The planner
--    stays the single decision point (#29's rule); this function is handed the two lists it must act
--    on. An email that matches a CURRENTLY SUPPRESSED person is still tagged — a tag is not a gate,
--    tagging contacts nobody, and suppression still bites at send (K-58).
--  - Suppression: a suppressed EMAIL re-imported is still filtered at send (resolved via email_normalized).
--    The SHARED-PHONE + phone-suppressed case (opsi d) is handled ENTIRELY in the pure planner
--    (import-audience.ts): such rows are dropped from insertRows BEFORE this function is called, so they
--    never appear in p_rows. This function therefore needs no suppression knowledge — it only ever
--    receives rows the planner already cleared. (Enforcing it here too would need the suppression set
--    passed in; deliberately not done — the planner is the single decision point, proven by its tests.)
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
  p_uploaded_by uuid,
  p_tag_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_tags    text[];
  v_inserted    integer;
  v_tagged      integer;
  v_shared_bat  integer;
begin
  -- TAG SHAPE GUARD (defence in depth — the wizard validates first, lib/crm/tags.ts). This regex is
  -- IDENTICAL to OPERATOR_TAG_REGEX_SOURCE there; tags.parity.test.ts compares them character for
  -- character. `batch:` and `tagged:` are deliberately absent from the namespace list: they are the
  -- system's markers, and a CSV able to inject `batch:<other-uuid>` could get a real customer deleted
  -- by an unrelated rollback. An invalid tag raises — silence is the failure class this whole sprint
  -- has been closing. At most five are named so the message stays bounded.
  select array_agg(distinct t) into v_bad_tags
    from (
      select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb)) as t
        from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
      union all
      select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb)) as t
        from jsonb_array_elements(coalesce(p_tag_rows, '[]'::jsonb)) r
    ) x
   where t !~ '^(event|format|kategori|nilai|peran|produk|sumber|tipe):[a-z0-9][a-z0-9-]*$';

  if v_bad_tags is not null then
    raise exception 'crm_ingest_csv_people: % invalid tag(s), e.g. %',
      cardinality(v_bad_tags), (v_bad_tags)[1:5]
      using errcode = '22023';
  end if;
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
  -- Dedup is EMAIL-PRIMARY (K-57): skip only an EMAIL match — email is a personal identity. A phone
  -- is a SHARED identifier, so a phone-only match is NOT skipped here; the colliding phone is nulled in
  -- `phone_safe` below instead, so a distinct person is never dropped for sharing a number. This matches
  -- the pure planner (import-audience.ts) exactly, so dry-run counts equal what execute writes.
  new_people as (
    select v.* from valid v
     where not exists (select 1 from public.master_customer m where m.email_normalized = v.ek)
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
      end as pk,
      -- Counted SEPARATELY from the master collision (#29's sharedPhone) because the two have
      -- different follow-ups: "this number belongs to another customer" vs "your file lists this
      -- number twice". Same distinction #29 already draws between duplicatesEmail and
      -- duplicatesInBatch, so it gets the same shape of name rather than one merged figure.
      (pk is not null
        and not exists (select 1 from public.master_customer m where m.phone_normalized = pk)
        and count(*) over (partition by pk) > 1) as shared_phone_in_batch
    from deduped
  ),
  ins as (
    insert into public.master_customer
      (full_name, email, email_normalized, phone_normalized, city,
       source, tags, first_seen_at, created_at, updated_at)
    select
      full_name, email_raw, ek, pk, city,
      'csv_import',
      array(select distinct unnest(array['csv_import', 'batch:' || p_batch_id::text] || row_tags) order by 1),
      now(), now(), now()
    from phone_safe
    returning customer_id
  )
  -- EXISTING people (TUGAS B): the tags column and NOTHING else. Not source, not full_name, not the
  -- phone, not updated_at — master stays authoritative (owner decision, 2 Sep). Tags are ADDED to
  -- whatever is already there, never replace it. `merged_into is not null` is skipped: a merged row
  -- moved its data elsewhere. NO crm_consent row for these people — they already have their own
  -- provenance, a tag is not a gate so contactability is unchanged, and UNIQUE (customer_id, channel,
  -- purpose) would collide with the 408,119 rows already recorded (K-58).
  tag_targets as (
    select
      lower(trim(r->>'email')) as ek,
      coalesce(array(select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb))), '{}') as row_tags
    from jsonb_array_elements(coalesce(p_tag_rows, '[]'::jsonb)) r
  ),
  upd as (
    update public.master_customer m
       set tags = array(
             select distinct unnest(
               coalesce(m.tags, '{}') || array['tagged:' || p_batch_id::text] || t.row_tags
             ) order by 1)
      from tag_targets t
     where m.email_normalized = t.ek
       and m.merged_into is null
    returning m.customer_id
  ),
  -- Consent EVIDENCE (basis explicit_opt_in — a value crm_consent_basis_check accepts), one row per
  -- NEWLY INSERTED person only. Not a gate — proof of provenance.
  cons as (
    insert into public.crm_consent
      (customer_id, channel, purpose, basis, status, source, evidence, recorded_at, updated_at)
    select
      i.customer_id, 'email', 'marketing', 'explicit_opt_in', 'active', 'csv_import',
      jsonb_build_object(
        'source', 'csv_import',
        'batch', p_batch_id::text,
        'uploaded_by', p_uploaded_by::text,
        'collection_source', p_collection_source
      ),
      now(), now()
    from ins i
    returning 1
  )
  select
    (select count(*) from cons),
    (select count(*) from upd),
    (select count(*) from phone_safe where shared_phone_in_batch)
  into v_inserted, v_tagged, v_shared_bat;

  -- What this function DID. `skipped` is deliberately NOT here: the planner drops every non-insert
  -- row before calling, so this function never sees them and cannot count them honestly. The screen
  -- gets `skipped` from the planner's summary, which does know. A function that guessed at rows it
  -- was never handed would be inventing a number.
  return jsonb_build_object(
    'inserted',              v_inserted,
    'tagged_existing',       v_tagged,
    'shared_phone_in_batch', v_shared_bat
  );
end $$;

-- Grants follow the NEW signature. The four-argument form was NEVER applied to production (verified:
-- absent from pg_proc, zero ledger stamps), so no older overload is left holding older privileges —
-- which is exactly why the tag arguments were folded in BEFORE the first apply instead of being
-- added as a second overload afterwards.
revoke all on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid, jsonb) to service_role;

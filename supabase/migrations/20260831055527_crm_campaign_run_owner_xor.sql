-- crm_campaign_run: a run belongs to EITHER a segment (campaign) OR a workflow, never both,
-- never neither. Fixes T-38: workflow runs died on the segment_id FK because a workflow id is not
-- a crm_segment id (runWorkflowAction passed workflowId as segmentId → FK violation →
-- createRun returned null → run_create_failed, masked in the UI as "cek konfigurasi kirim").
--
-- Applied + verified 2026-08-31 (ledger 20260831055527). Verified BEFORE apply: crm_campaign_run
-- had 12 rows, ALL segment-owned (segment_id filled). The XOR holds not because the table was empty
-- (it was not — my first note said 0; the owner corrected it to 12) but because every legacy row is
-- a campaign run: segment_id filled, workflow_id null once added → num_nonnulls(...) = 1 for all 12.
-- Verified AFTER apply: segment_id nullable YES, workflow_id nullable YES,
-- xor def CHECK ((num_nonnulls(segment_id, workflow_id) = 1)),
-- fk FOREIGN KEY (workflow_id) REFERENCES crm_workflow(id) ON DELETE RESTRICT,
-- index crm_campaign_run_workflow_idx present, 12/12 rows satisfy the XOR.

-- 1. segment_id no longer mandatory (a workflow run has none).
alter table public.crm_campaign_run
  alter column segment_id drop not null;

-- 2. New optional owner: the workflow this run belongs to.
alter table public.crm_campaign_run
  add column if not exists workflow_id uuid
    references public.crm_workflow(id) on delete restrict;

-- 3. XOR: exactly one of (segment_id, workflow_id) is filled. A run is owned by a segment OR a
--    workflow — never both, never neither. num_nonnulls counts the non-null args (clearer than a
--    chain of is null / is not null).
alter table public.crm_campaign_run
  add constraint crm_campaign_run_owner_xor
    check (num_nonnulls(segment_id, workflow_id) = 1);

-- 4. Look up a workflow's runs the same way we look up a segment's.
create index if not exists crm_campaign_run_workflow_idx
  on public.crm_campaign_run (workflow_id, template_key);

comment on constraint crm_campaign_run_owner_xor on public.crm_campaign_run is
  'A run belongs to exactly one owner: a segment (campaign) or a workflow. Enforces T-38 fix.';

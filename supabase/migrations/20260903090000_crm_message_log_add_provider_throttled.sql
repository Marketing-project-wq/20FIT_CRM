-- MIGRASI A (T-41) — add 'provider_throttled' to crm_message_log_failure_cause_check.
--
-- WHY A NEW CLASS RATHER THAN REUSING 'provider_rejected': 429 / 402 / 503 mean the PROVIDER is
-- throttling US (rate limit, quota exhausted, capacity) — they say nothing at all about the
-- recipient. 'provider_rejected' means a recipient-level 4xx. Folding throttling into it would make
-- our own rate limiting read as a recipient problem, and would poison any future bounce or
-- suppression decision built on these counts. The classes are kept apart on purpose.
--
-- Nothing else changes: the column stays nullable, every existing value stays legal, and no row is
-- rewritten. Postgres has no "add value to a check constraint", so the constraint is dropped and
-- recreated with the same name in one transaction — the table is never left unconstrained to a
-- concurrent writer.
--
-- APPLIED + VERIFIED 2026-09-03 (ledger stamp 20260903125132 — differs from this file name, the
-- same divergence pattern as migrations 15/28/30). Pre-apply, measured immediately before:
-- crm_message_log = 18,247 rows; runs in draft/sending = 0; crm_scheduled_send pending = 0;
-- failure_cause values in use = (null) / hard_bounce / unknown, all legal under old AND new CHECK.
-- Post-apply, re-read from pg_constraint: the array carries provider_throttled, convalidated = true,
-- 18,247 rows unchanged (nothing rewritten), provider_throttled = 0 rows.
--
-- Pre-apply state (read from pg_constraint 2026-09-03):
--   CHECK (((failure_cause IS NULL) OR (failure_cause = ANY
--     (ARRAY['invalid_address','hard_bounce','provider_rejected','daily_limit','unknown']))))
--
-- NOTE on 'daily_limit': it is in the CHECK but NO code path has ever written it — over-budget
-- recipients are DEFERRED (left unclaimed for a later run), never failed. It is carried forward
-- untouched here; removing it is a separate decision, not this migration's business.

alter table public.crm_message_log
  drop constraint if exists crm_message_log_failure_cause_check;

alter table public.crm_message_log
  add constraint crm_message_log_failure_cause_check
    check (
      failure_cause is null
      or failure_cause = any (array[
        'invalid_address',
        'hard_bounce',
        'provider_rejected',
        'provider_throttled',
        'daily_limit',
        'unknown'
      ])
    );

comment on constraint crm_message_log_failure_cause_check on public.crm_message_log is
  'Differentiated send-failure causes. provider_throttled (429/402/503) = the provider throttling US; provider_rejected = a recipient-level 4xx. Kept apart so throttling is never read as a recipient problem (T-41).';

-- ROLLBACK (safe only while NO row carries the new value — check first):
--   select count(*) from public.crm_message_log where failure_cause = 'provider_throttled';
--   -- if that is 0:
--   alter table public.crm_message_log drop constraint if exists crm_message_log_failure_cause_check;
--   alter table public.crm_message_log add constraint crm_message_log_failure_cause_check
--     check (failure_cause is null or failure_cause = any (array[
--       'invalid_address','hard_bounce','provider_rejected','daily_limit','unknown']));
--   -- and revert the app: lib/crm/send-run.ts must stop emitting 'provider_throttled' FIRST,
--   -- otherwise the next throttled send fails its UPDATE and the row keeps status 'queued'.

-- crm_campaign_run — background-drain state (P0-3, jalur kirim massal di proses latar).
--
-- WHY. Until now a manual send ran the whole engine INLINE inside the operator's HTTP request: one
-- day's budget (up to daily_limit sends @ >=500 ms pacing) is ~8-14 minutes of a held browser
-- connection, and a large scheduled send abandoned its daily-deferred remainder. P0-3 moves the send
-- OFF the request and into the pg_cron executor, draining a run in bounded BATCHES across ticks.
--
-- The "this run wants draining now" flag lives on the run itself — not a separate queue table —
-- because the run is the thing being drained and the deterministic idempotency key already scopes
-- everything to it (RENCANA-kirim-latar.md).
--
--   drain_active       true  -> the executor's drain pass must send this run's next batch.
--   drain_claimed_at   set by the executor when it starts a batch; guarded by a STALENESS window so a
--                      tick that crashed mid-batch does not wedge the run forever (a later tick whose
--                      claim is older than the window may re-claim). Idempotency (the unique
--                      idempotency_key on crm_message_log) is what actually prevents a double send, so
--                      this claim is an efficiency guard, not a correctness one.
--   drain_requested_by who kicked the drain off (operator email, or 'system:scheduled-send') — a
--                      trace, never authorization.
--
-- The run STATUS is unchanged: 'sending' while draining OR while paused-with-leftover. drain_active is
-- what tells the two apart on screen (Sedang mengirim vs Jeda: batas harian — Lanjutkan). No new
-- status value, no new check-constraint.
--
-- RESPECTS the planDailySpread decision (lib/crm/send-plan.ts): the drainer sends only up to TODAY's
-- shared daily budget, then clears drain_active and leaves the run 'sending' with its leftover, which
-- waits for a HUMAN to press "Lanjutkan" (which sets drain_active=true again). Cross-day auto-continue
-- is deliberately NOT built here.
--
-- crm_* pattern: RLS already ON, 0 policy; service_role already holds SELECT/INSERT/UPDATE on this
-- table (see 20260824180426), so these additive columns need NO new grant.
--
-- APPLY + VERIFY (ledger): additive columns, NULL/false defaults, one partial index. Nothing is
-- back-filled — every existing run keeps drain_active=false (none is mid-drain).

alter table public.crm_campaign_run
  add column if not exists drain_active       boolean not null default false,
  add column if not exists drain_claimed_at   timestamptz,
  add column if not exists drain_requested_by text;

comment on column public.crm_campaign_run.drain_active is
  'P0-3: true -> the pg_cron executor''s drain pass sends this run''s next batch. Cleared when the run '
  'is drained, auto-stopped, or paused at today''s daily budget (leftover then waits for a human '
  '"Lanjutkan", per the planDailySpread decision). Never means cross-day auto-continue.';
comment on column public.crm_campaign_run.drain_claimed_at is
  'P0-3: executor batch claim, guarded by a staleness window so a crashed tick cannot wedge the run. '
  'Idempotency (crm_message_log unique key) is the real double-send guard; this is efficiency only.';
comment on column public.crm_campaign_run.drain_requested_by is
  'P0-3: who started the drain (operator email or system:scheduled-send). A trace, not authorization.';

-- The executor lists claimable active drains: drain_active AND (unclaimed OR claim gone stale). A
-- partial index on the claim time, restricted to active drains, keeps that scan cheap regardless of
-- how many finished runs the table holds.
create index if not exists crm_campaign_run_drain_idx
  on public.crm_campaign_run (drain_claimed_at)
  where drain_active;

-- ── DOUBLE-SEND HARD STOP (owner request, closes the send_in_progress TOCTOU) ──────────────────
-- At most ONE in-progress ('sending') run per (segment_id, template_key). A SECOND run to the same
-- audience is a second campaign_id → DIFFERENT idempotency keys (idempotency only de-dupes WITHIN a
-- run) → everyone emailed twice. That is the 890-recipient ISS near-miss. The app guard
-- (activeSendingRunFor) is best-effort and has a TOCTOU under a same-instant double press; this
-- PARTIAL UNIQUE INDEX makes the DATABASE the arbiter, so the second run's transition to 'sending' is
-- rejected (23505) no matter how tight the race — the app then reports send_in_progress and abandons
-- the orphan draft.
--
-- WHY (segment_id, template_key) IS SAFE FOR WORKFLOW RUNS. A campaign run always has segment_id NOT
-- NULL (crm_campaign_run_owner_xor). A WORKFLOW run has segment_id NULL, and a B-tree unique index
-- treats NULLs as DISTINCT (the default, NULLS DISTINCT), so two automated 'sending' workflow runs —
-- (NULL, 't') vs (NULL, 't') — never collide here. So this constrains exactly the campaign runs it
-- must, and never an automated one. Verified read-only before writing: ZERO existing duplicate
-- (segment_id, template_key) pairs among 'sending' runs, so CREATE UNIQUE INDEX builds cleanly.
create unique index if not exists crm_campaign_run_one_active_per_pair
  on public.crm_campaign_run (segment_id, template_key)
  where status = 'sending';

comment on index public.crm_campaign_run_one_active_per_pair is
  'P0-3 double-send hard stop: at most one ''sending'' run per (segment, template). A second run would '
  'be a second campaign_id → different idempotency keys → double send. Workflow runs (segment_id NULL) '
  'are exempt because NULLs are distinct in a unique index.';

-- ROLLBACK (safe only while NO run is mid-drain — check first):
--   select count(*) from public.crm_campaign_run where drain_active;  -- expect 0
--   drop index if exists public.crm_campaign_run_one_active_per_pair;
--   drop index if exists public.crm_campaign_run_drain_idx;
--   alter table public.crm_campaign_run
--     drop column if exists drain_active,
--     drop column if exists drain_claimed_at,
--     drop column if exists drain_requested_by;
--   -- and revert the app FIRST (the executor/drainer/deliveries read these columns).

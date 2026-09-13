-- BACKFILL: auto-suppress hard-bounced emails recorded BEFORE the webhook
-- auto-suppress feature was deployed (P0-4).
--
-- HOW IT WORKS: finds every distinct email that has a hard_bounce in
-- crm_message_log, resolves it back to master_customer.email_normalized,
-- and inserts a suppression row — skipping any email already suppressed.
--
-- REVIEW the SELECT output first (Step 1), then run the INSERT (Step 2).
-- Execute via Supabase SQL editor with service_role.

-- Step 1: PREVIEW — see what would be suppressed (run this first)
SELECT DISTINCT mc.email_normalized
FROM crm_message_log ml
  JOIN master_customer mc ON mc.customer_id = ml.customer_id
WHERE ml.failure_cause = 'hard_bounce'
  AND ml.status = 'bounced'
  AND mc.email_normalized IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_suppression cs
    WHERE cs.identity_kind = 'email'
      AND cs.identity_key = mc.email_normalized
      AND cs.status = 'active'
  )
ORDER BY mc.email_normalized;

-- Step 2: INSERT (only after reviewing Step 1 output)
-- Uses the crm_record_suppression RPC per-row for atomicity + audit trail.
-- If bulk INSERT is preferred for speed, uncomment the block below instead.
--
-- DO {
--   SELECT crm_record_suppression(
--     p_identity_kind := 'email',
--     p_identity_key  := mc.email_normalized,
--     p_reason_code   := 'bounce',
--     p_reason_detail := 'Backfill: hard bounce from crm_message_log',
--     p_customer_id   := mc.customer_id::text,
--     p_source        := 'webhook_auto',
--     p_actor_id      := NULL,
--     p_actor_email   := NULL
--   )
--   FROM (
--     SELECT DISTINCT mc.customer_id, mc.email_normalized
--     FROM crm_message_log ml
--       JOIN master_customer mc ON mc.customer_id = ml.customer_id
--     WHERE ml.failure_cause = 'hard_bounce'
--       AND ml.status = 'bounced'
--       AND mc.email_normalized IS NOT NULL
--       AND NOT EXISTS (
--         SELECT 1 FROM crm_suppression cs
--         WHERE cs.identity_kind = 'email'
--           AND cs.identity_key = mc.email_normalized
--           AND cs.status = 'active'
--       )
--   ) mc;
-- }
--
-- Alternative: direct INSERT (faster but no audit row — use only if the RPC
-- approach above is too slow for the backfill volume):
/*
INSERT INTO crm_suppression (identity_kind, identity_key, reason_code, reason_detail, source, status)
SELECT DISTINCT
  'email',
  mc.email_normalized,
  'bounce',
  'Backfill: hard bounce from crm_message_log',
  'webhook_auto',
  'active'
FROM crm_message_log ml
  JOIN master_customer mc ON mc.customer_id = ml.customer_id
WHERE ml.failure_cause = 'hard_bounce'
  AND ml.status = 'bounced'
  AND mc.email_normalized IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_suppression cs
    WHERE cs.identity_kind = 'email'
      AND cs.identity_key = mc.email_normalized
      AND cs.status = 'active'
  )
ON CONFLICT (identity_kind, identity_key) WHERE status = 'active'
  DO NOTHING;
*/

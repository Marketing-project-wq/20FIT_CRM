/**
 * Send-path audit constant. Client-safe (a screen may show/label it); no I/O here.
 *
 * WHY `export.` AND NOT A NEW FAMILY. A campaign send is outbound contact leaving the system — the
 * same shape as a CSV export (`export.performed`), and it must be RETAINED as compliance evidence
 * of who we messaged and when. The migration-8 denylist already classifies the `export.` prefix as
 * compliance (permanent). Reusing that prefix is deliberate: it keeps the action from becoming the
 * sixth "new action that lands in neither list" (→ retention class `other`). The exact name is
 * pinned to its class by lib/crm/send-constants.test.ts, so a future rename can't silently reclass
 * it. ONE audit row is written per send RUN (not per recipient) — like `export.performed` records a
 * row count, not each row; the per-recipient detail lives in crm_message_log.
 */
export const SEND_ACTION = "export.campaign_sent";

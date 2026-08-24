/**
 * Send-path audit constant. Client-safe (a screen may show/label it); no I/O here.
 *
 * WHY `campaign.` AND NOT `export.` (reversed 2026-08-24, K-39). A campaign send is outbound
 * CONTACT — a record of who we messaged and when — which must be retained as compliance evidence.
 * The first cut reused the `export.` prefix so it would land in the compliance denylist; the
 * retention CLASS was right, but the MEANING was wrong: `export.%` answers "what data left the
 * system as a FILE", and putting a send there makes an audit screen filtering "exports" show
 * campaigns. So `campaign.%` is its OWN compliance family, added to the live purge denylist the
 * K-09 way (migration + retention-policy.ts + parity test in one change). ONE audit row is written
 * per send RUN — the per-recipient / per-message detail lives in crm_message_log, which is why the
 * family is `campaign.` (per campaign run), not `message.` (per message). Pinned to its class by
 * lib/crm/send-constants.test.ts with the exact string, so a rename can't silently reclassify it.
 */
export const SEND_ACTION = "campaign.sent";

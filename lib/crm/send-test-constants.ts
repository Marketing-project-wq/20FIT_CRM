/**
 * Constants + pure helpers for the internal send-test harness (RUNBOOK-kirim-internal-pertama).
 * Kept OUT of the server-only harness so they can be unit-tested and referenced by the composer
 * (which must HIDE the seeded test template from the real dropdown).
 *
 * Why a harness exists at all — the verified deadlock (24 Agu 2026): the pre-launch gate allows ONLY
 * @20fit.id destinations while CAMPAIGN_SEND_ENABLED is off, but master_customer holds ZERO @20fit.id
 * addresses (staff are not customers). Segments resolve recipients only from master_customer, so an
 * internal-only smoke test through the composer resolves 0 sendable — nothing to prove. The harness
 * feeds ONE internal address (from env, never hardcoded) into the SAME engine + ports + audit + gate,
 * so the artifacts (crm_message_log row + provider_message_id, one campaign.sent audit row, a
 * crm_campaign_run row) prove the real chain, not a parallel one.
 */

/** Env var holding the single internal @20fit.id destination for the test. Never hardcode a target —
 *  an address embedded in code ships in the deploy and lingers forever. Unset ⇒ the harness refuses. */
export const INTERNAL_TEST_ENV_VAR = "SEND_TEST_INTERNAL_ADDRESS";

/** Sentinel key for the seeded test email template. crm_message_template is INSERT-only for
 *  service_role (append-only by design, K-14) — the row cannot be deleted or deactivated, so instead
 *  the composer EXCLUDES this key from its dropdown. Clearly a test marker at a glance. */
export const INTERNAL_TEST_TEMPLATE_KEY = "__uji_internal__";

/** Name for the seeded test segment (soft-deletable via is_active — the harness archives it on
 *  cleanup). Prefixed so it reads as test data anywhere it surfaces. */
export const INTERNAL_TEST_SEGMENT_NAME = "UJI — kirim internal (data uji)";

/** Sentinel pseudo-customer id for the test log row. crm_message_log.customer_id is uuid NOT NULL
 *  with NO FK to master_customer, so a synthetic id is valid AND writes nothing to the frozen pool.
 *  Fixed (not random) so a re-run WITHIN one run resumes via the deterministic idempotency key.
 *  Equals internalTestCustomerId(0). */
export const INTERNAL_TEST_CUSTOMER_ID = "00000000-0000-0000-0000-0000000f1770";

/**
 * A VALID sentinel uuid for the i-th internal test recipient. crm_message_log.customer_id and
 * crm_suppression.customer_id are both `uuid`, so the recipient id MUST parse as a uuid — a suffixed
 * string like `${INTERNAL_TEST_CUSTOMER_ID}-${i}` is NOT a valid uuid and throws
 * `invalid input syntax for type uuid` at the log insert (the regression that broke the
 * crm_test_recipient path since 26 Aug). This keeps the recognizable sentinel prefix and varies only
 * the final 12-hex node (base 0x…f1770 + i): index 0 is the original sentinel (stable idempotency on
 * re-run), and every index yields a distinct, valid uuid.
 */
export function internalTestCustomerId(i: number): string {
  const node = (0xf1770 + i).toString(16).padStart(12, "0");
  return `00000000-0000-0000-0000-${node}`;
}

/** True for the seeded test template key — used by the composer to keep it out of the real dropdown. */
export function isInternalTestTemplateKey(key: string): boolean {
  return key === INTERNAL_TEST_TEMPLATE_KEY;
}

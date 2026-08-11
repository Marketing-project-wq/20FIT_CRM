import "server-only";

/**
 * PII-free structured failure log to Railway. Mirrors the shape already used in
 * app/login/actions.ts (console.error with a tagged label + a small scalar object) so
 * there is ONE logging idiom, not two.
 *
 * WHY: today a 500/503 vanishes the moment the response is sent, so a failed audited
 * operation leaves no trace except a hole in crm_audit_log.id (see lib/crm/audit-gap.ts).
 * This gives every server-side failure a durable, greppable trace with enough to
 * investigate — route, failure kind, and a DB/HTTP status or code.
 *
 * PII IS FORBIDDEN, BY CONSTRUCTION. This function accepts ONLY scalar `code`/`status`.
 * It cannot receive identity_key, a search query, a customer_id, or reason_detail because
 * there is no parameter to pass them through. If a failure can only be understood by
 * including identity, it must NOT be logged — record the shape of the error, never the
 * subject. Do not widen this signature to take a free-form message: a message is where
 * PII leaks in.
 */
export function logApiFailure(
  route: string,
  kind: string,
  ctx?: { code?: string | number | null; status?: number | null },
): void {
  console.error(`[api ${route}] ${kind}`, {
    code: ctx?.code ?? null,
    status: ctx?.status ?? null,
  });
}

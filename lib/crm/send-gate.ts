/**
 * Send gate (pure, testable). The earlier deliverability prerequisites are now MET — SPF/DKIM/DMARC
 * all PASS (verified from a real Gmail header, 31 Aug 2026) and B2/B3 were retired. What remains is
 * not configuration but operational caution: ramp gradually, smallest-strongest segment first, with
 * the 5% bounce auto-stop active (K-49). So real sending stays behind ONE explicit switch rather than
 * flipping on by default:
 *
 *   - Real customer sending is OFF unless CAMPAIGN_SEND_ENABLED === 'true' (a deliberate operator
 *     flip on the host, made when they are ready to start the graduated ramp).
 *   - While OFF, the only addresses that may be sent to are INTERNAL 20fit.id addresses — for the
 *     internal test the product owner asked for. Everyone else is WITHHELD (not sent, not logged;
 *     they simply wait for the flip — the same "defer, don't fail" posture as the daily limit).
 *
 * The adapter consults this before every send; a test proves the gate actually withholds customers.
 */

export function realSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CAMPAIGN_SEND_ENABLED === "true";
}

/** An internal 20fit.id address — the only destination allowed while real sending is OFF. */
export function isInternalAddress(email: string): boolean {
  return /@20fit\.id$/i.test(email.trim());
}

/**
 * May we send to this destination right now? `true` only when real sending is enabled, OR the
 * destination is internal (the allowed pre-launch test target). A non-internal customer address
 * while sending is disabled returns `false` → the adapter WITHHOLDS it (does not send, does not log).
 */
export function maySendTo(destination: string, enabled: boolean): boolean {
  return enabled || isInternalAddress(destination);
}

/**
 * Pre-launch send gate (pure, testable). The two BLOCKING prerequisites in RENCANA-batas-kirim.md —
 * rotate the leaked MAILTRAP_API_TOKEN, and set SPF/DKIM/DMARC — are not yet met, so the LARANGAN is
 * absolute: ZERO campaign email to a customer address until then. Rather than trust a convention,
 * this gate makes it code:
 *
 *   - Real customer sending is OFF unless CAMPAIGN_SEND_ENABLED === 'true' (an explicit human flip,
 *     set only after the token is rotated and DNS is in place).
 *   - While OFF, the only addresses that may be sent to are INTERNAL 20fit.id addresses — for the
 *     internal test the product owner asked for. Everyone else is WITHHELD (not sent, not logged;
 *     they simply wait for launch — the same "defer, don't fail" posture as the daily limit).
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

import { describe, it, expect } from "vitest";
import {
  INTERNAL_TEST_TEMPLATE_KEY,
  INTERNAL_TEST_CUSTOMER_ID,
  isInternalTestTemplateKey,
  internalTestCustomerId,
} from "./send-test-constants";
import { isInternalAddress } from "./send-gate";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The send-test harness leans on these sentinels being (a) a valid uuid for the log's NOT-NULL
 * customer_id, and (b) recognizable so the composer can hide the seeded template. Also re-assert the
 * gate the harness depends on: only @20fit.id targets pass while sending is off.
 */
describe("send-test constants", () => {
  it("customer sentinel is a syntactically valid uuid (log.customer_id is uuid NOT NULL, no FK)", () => {
    expect(INTERNAL_TEST_CUSTOMER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("internalTestCustomerId(i) is ALWAYS a valid uuid — the `${sentinel}-${i}` suffix was NOT (regression)", () => {
    // The old harness built `${INTERNAL_TEST_CUSTOMER_ID}-${i}` = "…f1770-0", which Postgres rejects
    // as a uuid → the send threw at the log insert. Every index must parse as a uuid now.
    for (let i = 0; i < 40; i++) {
      expect(internalTestCustomerId(i)).toMatch(UUID_RE);
    }
    // The known-bad suffixed form must NOT match (guards the regression from returning).
    expect(`${INTERNAL_TEST_CUSTOMER_ID}-0`).not.toMatch(UUID_RE);
  });

  it("index 0 keeps the original sentinel (stable idempotency) and indices are distinct", () => {
    expect(internalTestCustomerId(0)).toBe(INTERNAL_TEST_CUSTOMER_ID);
    const ids = new Set([0, 1, 2, 3, 10].map(internalTestCustomerId));
    expect(ids.size).toBe(5);
  });

  it("recognizes its own template key (so the composer can exclude it) and nothing else", () => {
    expect(isInternalTestTemplateKey(INTERNAL_TEST_TEMPLATE_KEY)).toBe(true);
    expect(isInternalTestTemplateKey("welcome_email")).toBe(false);
    expect(isInternalTestTemplateKey("")).toBe(false);
  });

  it("depends on the internal-address gate: @20fit.id passes, a customer address does not", () => {
    expect(isInternalAddress("staff@20fit.id")).toBe(true);
    expect(isInternalAddress("customer@gmail.com")).toBe(false);
  });
});

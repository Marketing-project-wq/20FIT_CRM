import { describe, it, expect } from "vitest";
import {
  INTERNAL_TEST_TEMPLATE_KEY,
  INTERNAL_TEST_CUSTOMER_ID,
  isInternalTestTemplateKey,
} from "./send-test-constants";
import { isInternalAddress } from "./send-gate";

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

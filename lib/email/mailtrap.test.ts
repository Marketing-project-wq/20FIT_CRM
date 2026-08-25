import { describe, it, expect } from "vitest";
import { extractMessageId } from "./mailtrap-parse";

/**
 * Mailtrap Sending returns `{ success: true, message_ids: ["<id>"] }`. We keep the FIRST id as
 * crm_message_log.provider_message_id so webhook correlation uses the provider's own id, not a
 * hashed-address match. The extractor is tolerant: a body without ids yields null (recorded
 * honestly), never a thrown error on an already-sent message.
 */
describe("mailtrap extractMessageId", () => {
  it("returns the first id from message_ids", () => {
    expect(extractMessageId({ success: true, message_ids: ["abc-123", "def-456"] })).toBe("abc-123");
  });
  it("returns null when there are no ids / wrong shape / null body", () => {
    expect(extractMessageId({ success: true, message_ids: [] })).toBeNull();
    expect(extractMessageId({ success: true })).toBeNull();
    expect(extractMessageId(null)).toBeNull();
    expect(extractMessageId({ message_ids: [123] })).toBeNull(); // non-string id
  });
});

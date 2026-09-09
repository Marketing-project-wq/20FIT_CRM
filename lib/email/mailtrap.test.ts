import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { extractMessageId } from "./mailtrap-parse";
import { sendTransactionalEmail } from "./mailtrap";

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

/**
 * The from-NAME is a parameter with default "20FIT CRM" (T-74). Left at the default, the
 * reset path is byte-for-byte unchanged; the campaign path overrides it with the template's
 * sender name so a customer email is no longer forced to sign itself "20FIT CRM". The from-ADDRESS
 * stays MAILTRAP_FROM regardless (the one verified sending domain, not a per-message setting).
 */
describe("sendTransactionalEmail — sender name", () => {
  const mail = { to: "x@example.com", subject: "s", text: "t", html: "<p>t</p>" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.MAILTRAP_API_TOKEN = "test-token";
    process.env.MAILTRAP_FROM = "crm@20fit.id";
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, message_ids: ["id-1"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAILTRAP_API_TOKEN;
    delete process.env.MAILTRAP_FROM;
  });

  function sentBody() {
    return JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
  }

  it("defaults the from-name to 20FIT CRM (reset path unchanged)", async () => {
    await sendTransactionalEmail(mail);
    expect(sentBody().from).toEqual({ email: "crm@20fit.id", name: "20FIT CRM" });
  });

  it("uses the sender name passed by the campaign path, keeping the verified from-address", async () => {
    await sendTransactionalEmail(mail, "crm-campaign", "20FIT Studio");
    expect(sentBody().from).toEqual({ email: "crm@20fit.id", name: "20FIT Studio" });
  });
});

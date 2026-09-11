import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  sendTransactionalEmail,
  extractResendId,
  extractResendBatchIds,
  RESEND_BATCH_LIMIT,
  type ResendSendError,
} from "./resend";

/**
 * The Resend adaptor must be contract-identical to lib/email/mailtrap.ts so the two are interchangeable
 * behind lib/email/send.ts: the from-identity is one "Name <email>" string, the message id comes from
 * the top-level `id`, and — the part the whole silent-failure fix rests on (T-41) — a non-2xx throws an
 * Error carrying the numeric status as `err.status`, with NO recipient address anywhere in the message.
 */
describe("extractResendId", () => {
  it("returns the top-level id", () => {
    expect(extractResendId({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" })).toBe("49a3999c-0ce1-4ea6-ab68-afcd6dc2e794");
  });
  it("returns null on a missing/empty/wrong-shape id (recorded honestly, never invented)", () => {
    expect(extractResendId({})).toBeNull();
    expect(extractResendId({ id: "" })).toBeNull();
    expect(extractResendId({ id: 123 })).toBeNull();
    expect(extractResendId(null)).toBeNull();
  });
});

describe("sendTransactionalEmail (Resend)", () => {
  const mail = { to: "person@example.com", subject: "s", text: "t", html: "<p>t</p>" };
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "crm@20fit.id";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });
  function stubFetch(status: number, body: unknown) {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
  }
  function sentBody() {
    return JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
  }

  it("hits POST https://api.resend.com/emails with a Bearer key and returns providerMessageId from id", async () => {
    stubFetch(200, { id: "abc-123" });
    const receipt = await sendTransactionalEmail(mail, "crm-campaign", "20FIT Studio");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(receipt.providerMessageId).toBe("abc-123");
  });

  it("builds from as a single 'Name <email>' string; default name is 20FIT CRM", async () => {
    stubFetch(200, { id: "x" });
    await sendTransactionalEmail(mail); // default senderName
    const body = sentBody();
    expect(body.from).toBe("20FIT CRM <crm@20fit.id>");
    expect(body.to).toEqual(["person@example.com"]);
    expect(body.tags).toEqual([{ name: "category", value: "password-reset" }]);
  });

  it("passes a campaign sender name into the from string, keeping the verified address", async () => {
    stubFetch(200, { id: "x" });
    await sendTransactionalEmail(mail, "crm-campaign", "20FIT Studio Kemang");
    expect(sentBody().from).toBe("20FIT Studio Kemang <crm@20fit.id>");
  });

  it("on a non-2xx throws with the numeric status as err.status and NO recipient in the message (T-41)", async () => {
    stubFetch(429, { message: "rate limited" });
    let thrown: ResendSendError | null = null;
    try {
      await sendTransactionalEmail(mail);
    } catch (e) {
      thrown = e as ResendSendError;
    }
    expect(thrown?.status).toBe(429); // status is a PROPERTY the classifier reads (→ provider_throttled)
    expect(thrown?.message).not.toContain("person@example.com"); // never the recipient
    expect(thrown?.message).not.toContain("rate limited"); // never the response body (could echo PII)
  });

  it("throws a config error (no send) when RESEND_API_KEY / RESEND_FROM are missing", async () => {
    delete process.env.RESEND_API_KEY;
    stubFetch(200, { id: "x" });
    await expect(sendTransactionalEmail(mail)).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * BATCH id extraction. Resend answers a batch with `{ data: [{id}, …] }` INDEX-ALIGNED with the
 * request array, and that alignment is load-bearing: provider_message_id is what every later webhook
 * (delivered / bounced / complained) is correlated on. An id that slides one position would silently
 * attach one recipient's delivery events to a DIFFERENT recipient — a corruption no later check could
 * detect. So the parser is required to preserve POSITION and pad, never to compact.
 */
describe("extractResendBatchIds", () => {
  it("returns ids in request order", () => {
    const body = { data: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    expect(extractResendBatchIds(body, 3)).toEqual(["a", "b", "c"]);
  });

  it("pads to the expected length when the provider returns fewer rows", () => {
    expect(extractResendBatchIds({ data: [{ id: "a" }] }, 3)).toEqual(["a", null, null]);
  });

  it("holds POSITION when a middle entry is malformed — it must not compact", () => {
    // The third recipient's id must stay null; "c" must NOT slide up into slot 1.
    const body = { data: [{ id: "a" }, { nope: true }, { id: "c" }] };
    expect(extractResendBatchIds(body, 3)).toEqual(["a", null, "c"]);
  });

  it("treats a missing/!array data as all-unknown rather than throwing", () => {
    expect(extractResendBatchIds({}, 2)).toEqual([null, null]);
    expect(extractResendBatchIds(null, 2)).toEqual([null, null]);
    expect(extractResendBatchIds({ data: "nope" }, 1)).toEqual([null]);
  });

  it("rejects a non-string or empty id instead of inventing one", () => {
    expect(extractResendBatchIds({ data: [{ id: 42 }, { id: "" }] }, 2)).toEqual([null, null]);
  });

  it("pins Resend's documented batch ceiling", () => {
    expect(RESEND_BATCH_LIMIT).toBe(100);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { activeFromAddress, sendTransactionalEmail } from "./send";

/**
 * TAMBAHAN A crossing lock: the address the template PREVIEW shows (activeFromAddress) must equal the
 * address the ADAPTOR actually sends from. One test across both — the T-74 lesson — so a hardcoded
 * preview address, or an adaptor that reads a different env, goes red. Under Resend the from-address is
 * info@20fit.id; under Mailtrap it stays crm@20fit.id.
 */
describe("preview from-address == adaptor from-address", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "x", message_ids: ["x"], success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.MAILTRAP_API_TOKEN;
    delete process.env.MAILTRAP_FROM;
  });
  const mail = { to: "x@example.com", subject: "s", text: "t", html: "<p>t</p>" };
  function sentBody() {
    return JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
  }

  it("Resend: preview shows info@20fit.id and the adaptor sends from the same address", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "info@20fit.id";
    const previewShows = activeFromAddress();
    expect(previewShows).toBe("info@20fit.id");
    await sendTransactionalEmail(mail, "crm-campaign", "20FIT");
    // Resend's from is one "Name <email>" string; it must carry the SAME address the preview showed.
    expect(sentBody().from).toBe(`20FIT <${previewShows}>`);
  });

  it("Mailtrap (default): preview shows crm@20fit.id and the adaptor sends from the same address", async () => {
    process.env.EMAIL_PROVIDER = "mailtrap";
    process.env.MAILTRAP_API_TOKEN = "test";
    process.env.MAILTRAP_FROM = "crm@20fit.id";
    const previewShows = activeFromAddress();
    expect(previewShows).toBe("crm@20fit.id");
    await sendTransactionalEmail(mail, "crm-campaign", "20FIT");
    // Mailtrap's from is an {email,name} object; the address must equal what the preview showed.
    expect(sentBody().from.email).toBe(previewShows);
  });
});

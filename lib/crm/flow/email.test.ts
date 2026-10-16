import { describe, expect, it } from "vitest";
import { ctxVars, fillVars, renderFlowEmail, withUtm } from "./email";

const vars = { first_name: "Budi", full_name: "Budi Santoso", city: "Jakarta" };
const opts = { flowId: "L14", node: "n2", unsubscribeUrl: "https://crm.20fit.id/unsubscribe?token=T" };

describe("flow email renderer", () => {
  it("fills known variables and blanks unknown ones (never a raw {{…}} in an inbox)", () => {
    expect(fillVars("Halo {{first_name}} {{ nope }}!", vars)).toBe("Halo Budi !");
  });

  it("escapes user-supplied copy", () => {
    const r = renderFlowEmail({ subject: "S", headline: "<b>x</b>", body: "a & b" }, vars, opts);
    expect(r.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(r.html).toContain("a &amp; b");
  });

  it("adds UTM to the CTA and keeps the unsubscribe footer", () => {
    const r = renderFlowEmail({ subject: "S", body: "x", cta_label: "Pesan", cta_url: "https://booking.20fit.id/clinic" }, vars, opts);
    expect(r.html).toContain("utm_campaign=flow_l14");
    expect(r.html).toContain("utm_content=n2");
    expect(r.html).toContain(opts.unsubscribeUrl);
  });

  it("drops a non-https CTA instead of linking it", () => {
    const r = renderFlowEmail({ subject: "S", body: "x", cta_label: "Pesan", cta_url: "http://evil.example" }, vars, opts);
    expect(r.html).not.toContain("evil.example");
  });

  it("shows the promo box only when a code is set", () => {
    expect(renderFlowEmail({ subject: "S", body: "x" }, vars, opts).html).not.toContain("dashed");
    expect(renderFlowEmail({ subject: "S", body: "Kode {{promo_code}}", promo_code: "RCV20" }, vars, opts).html).toContain("RCV20");
  });

  it("formats context: product prefix stripped, dates in WIB", () => {
    const c = ctxVars({ produk: "Ticket.20fit.id — Jakarta Hybrid Race", event_mulai: "2026-11-06T00:00:00Z" });
    expect(c.produk).toBe("Jakarta Hybrid Race");
    expect(c.event_mulai).toContain("2026");
  });

  it("leaves existing utm params alone", () => {
    expect(withUtm("https://20fit.id/?utm_source=x", "L1", "n1")).toContain("utm_source=x");
  });
});

describe("business-unit branding", () => {
  it("picks the unit from the CTA destination", async () => {
    const { detectBrand } = await import("./brands");
    expect(detectBrand(undefined, "https://booking.20fit.id/clinic").key).toBe("clinic");
    expect(detectBrand(undefined, "https://booking.20fit.id/book").key).toBe("arena");
    expect(detectBrand(undefined, "https://ticket.20fit.id").key).toBe("event");
    expect(detectBrand(undefined, "https://photo.20fit.id").key).toBe("photo");
    expect(detectBrand(undefined, "https://media.20fit.id/category/lari/").key).toBe("media");
    expect(detectBrand(undefined, "https://my.20fit.id").key).toBe("app");
    expect(detectBrand("shop", "https://ticket.20fit.id").key).toBe("shop");
    expect(detectBrand(undefined, "not a url").key).toBe("group");
  });

  it("renders the unit's logo, contact and sender name", () => {
    const r = renderFlowEmail({ subject: "S", body: "x", cta_label: "Pesan", cta_url: "https://booking.20fit.id/clinic" }, vars, opts);
    expect(r.senderName).toBe("20FIT Sports Clinic");
    expect(r.html).toContain("logo-clinic-white.png");
    expect(r.html).toContain("Jl. Sinabung No. 9");
    expect(r.html).toContain("EKOSISTEM 20FIT");
  });
});

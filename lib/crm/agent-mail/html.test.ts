import { describe, it, expect } from "vitest";
import { ensureUnsubscribe, withPreheader } from "./html";

describe("Agent Mail HTML helpers", () => {
  it("leaves an email that already has {{unsubscribe_url}} untouched", () => {
    const html = '<p>Hai</p><a href="{{unsubscribe_url}}">stop</a>';
    expect(ensureUnsubscribe(html)).toEqual({ html, added: false });
  });
  it("adds a visible footer before </body> in a full document", () => {
    const r = ensureUnsubscribe("<!doctype html><html><body><p>Promo</p></body></html>");
    expect(r.added).toBe(true);
    expect(r.html).toMatch(/\{\{unsubscribe_url\}\}[\s\S]*<\/body>/);
  });
  it("a fragment only gets the variable (the CRM skeleton prints the link) — never a second visible link", () => {
    const r = ensureUnsubscribe("<p>Promo</p>");
    expect(r.added).toBe(true);
    expect(r.html).toContain("<!-- {{unsubscribe_url}} -->");
    expect(r.html).not.toContain("<a ");
  });
  it("puts the preheader right after <body>, escaped", () => {
    const out = withPreheader("<html><body><p>x</p></body></html>", "Diskon <20%>");
    expect(out).toMatch(/<body><div style="display:none[^"]*">Diskon &lt;20%&gt;<\/div><p>/);
    expect(withPreheader("<p>x</p>", "")).toBe("<p>x</p>");
  });
});

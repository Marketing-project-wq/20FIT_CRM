import { describe, it, expect } from "vitest";
import {
  renderEmailDocument,
  wrapEmailSkeleton,
  isFullHtmlDocument,
  emailHtmlToText,
} from "./email-document";

const UNSUB = "https://crm.20fit.id/unsubscribe?token=abc123";

describe("renderEmailDocument — no send-side mangling (T-37)", () => {
  it("sends a full HTML document VERBATIM — never <br/>-mangled, never <div>-wrapped", () => {
    const doc = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n<table><tr><td>Hi ${UNSUB}</td></tr></table>\n</body>\n</html>`;
    const { html } = renderEmailDocument(doc, UNSUB);
    expect(html).toBe(doc); // byte-identical: the legacy template ships exactly as authored
    expect(html).not.toContain("<br/>"); // the regression that broke desktop Gmail
    expect(html.startsWith("<div>")).toBe(false);
  });

  it("does NOT convert newlines to <br/> inside HTML (the exact bug)", () => {
    const doc = `<html><body><p>a</p>\n<p>b</p>\n<p>c</p></body></html>`;
    const { html } = renderEmailDocument(`${doc}\n${UNSUB}`, UNSUB);
    // The old code did body.replace(/\n/g,"<br/>"); assert that never happens now.
    expect(html).not.toMatch(/<br\s*\/?>/);
  });

  it("wraps an HTML FRAGMENT in the bulletproof skeleton", () => {
    const { html } = renderEmailDocument(`<p>Halo</p>`, UNSUB);
    expect(isFullHtmlDocument(html)).toBe(true);
    expect(html).toContain('width="600"');
    expect(html).toContain("max-width:600px");
    expect(html).toContain("width=device-width"); // viewport
    expect(html.toLowerCase()).toContain("background:#f4f4f5"); // LIGHT default
    expect(html).toContain(UNSUB); // unsubscribe guaranteed
    // no forbidden layout mechanisms
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)/i);
    expect(html).not.toMatch(/position\s*:\s*(absolute|fixed)/i);
  });

  it("wraps PLAIN TEXT: escapes + newline→<br> INSIDE the skeleton (not raw HTML injection)", () => {
    const { html } = renderEmailDocument("Halo & selamat\nbaris dua", UNSUB);
    expect(isFullHtmlDocument(html)).toBe(true);
    expect(html).toContain("Halo &amp; selamat<br>baris dua");
  });

  it("never double-links unsubscribe: a fragment that already has the URL gets no extra footer", () => {
    const frag = `<p>Isi</p><p><a href="${UNSUB}">Berhenti berlangganan</a></p>`;
    const { html } = renderEmailDocument(frag, UNSUB);
    const occurrences = html.split(UNSUB).length - 1;
    expect(occurrences).toBe(1);
  });

  it("plain-text alternative keeps the unsubscribe URL (assertHasUnsubscribeLink checks BOTH parts)", () => {
    const { text } = renderEmailDocument(`<p>Halo</p>`, UNSUB);
    expect(text).toContain(UNSUB);
  });
});

describe("isFullHtmlDocument", () => {
  it("recognizes a document vs a fragment", () => {
    expect(isFullHtmlDocument("<!DOCTYPE html><html>..</html>")).toBe(true);
    expect(isFullHtmlDocument("<html><body>x</body></html>")).toBe(true);
    expect(isFullHtmlDocument("<p>just a fragment</p>")).toBe(false);
    expect(isFullHtmlDocument("plain text")).toBe(false);
  });
});

describe("wrapEmailSkeleton", () => {
  it("is table-based, inline-styled, 600px, light — nothing depends on a <style> block", () => {
    const html = wrapEmailSkeleton("<p>x</p>", UNSUB);
    expect(html).not.toContain("<style"); // layout must not live in a droppable <style>
    expect(html).toContain('role="presentation"');
    expect(html).toContain("mso"); // Outlook ghost table / PixelsPerInch present
  });
});

describe("emailHtmlToText", () => {
  it("turns a link into 'label (url)' and appends unsubscribe if missing", () => {
    const t = emailHtmlToText(`<p>Hi</p><a href="https://x.test/a">click</a>`, UNSUB);
    expect(t).toContain("click (https://x.test/a)");
    expect(t).toContain(UNSUB);
  });
});

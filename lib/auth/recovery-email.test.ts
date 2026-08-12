import { describe, it, expect } from "vitest";
import { buildRecoveryEmail } from "./recovery-email";

describe("buildRecoveryEmail (Indonesian, app-sent — not the shared Supabase template)", () => {
  const code = "483920";
  const built = buildRecoveryEmail(code, "1 jam");

  it("places the six-digit code in both text and html bodies", () => {
    expect(built.text).toContain(code);
    expect(built.html).toContain(code);
  });

  it("states the validity window so nobody tries an expired code", () => {
    expect(built.text).toContain("1 jam");
    expect(built.html).toContain("1 jam");
  });

  it("names 20FIT CRM (organisational context — a spam signal we can fix from here)", () => {
    expect(built.subject).toContain("20FIT CRM");
    expect(built.text).toContain("20FIT CRM");
    expect(built.html).toContain("20FIT CRM");
  });

  it("is Indonesian, not the English Supabase default", () => {
    expect(built.text.toLowerCase()).toContain("kata sandi");
    // The English default said "Follow this link to reset the password" — must not appear.
    expect(built.text.toLowerCase()).not.toContain("follow this link");
  });

  it("does not embed a reset LINK — this flow uses a code, not {{ .ConfirmationURL }}", () => {
    expect(built.html).not.toContain("http://");
    expect(built.html).not.toContain("https://");
    expect(built.html).not.toContain("ConfirmationURL");
  });
});

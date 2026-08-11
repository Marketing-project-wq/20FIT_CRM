import { describe, it, expect } from "vitest";
import {
  isContactableForMarketing,
  suppressionKey,
  type ConsentRow,
  type Identity,
} from "./contactability";
import { prepareIdentity } from "./suppression-input";
import { normalizePhoneID } from "./normalize";

const marketingActive: ConsentRow = { channel: "whatsapp", purpose: "marketing", status: "active" };
const marketingWithdrawn: ConsentRow = { channel: "whatsapp", purpose: "marketing", status: "withdrawn" };
const transactionalActive: ConsentRow = { channel: "email", purpose: "transactional", status: "active" };

const phone: Identity = { kind: "phone", key: "628123456789" };
const email: Identity = { kind: "email", key: "a@b.com" };

describe("isContactableForMarketing", () => {
  it("fail-closed: no consent at all -> not contactable", () => {
    expect(isContactableForMarketing([], [phone], new Set())).toBe(false);
  });

  it("active marketing consent, not suppressed -> contactable", () => {
    expect(isContactableForMarketing([marketingActive], [phone], new Set())).toBe(true);
  });

  it("SUPPRESSION WINS: active marketing consent but identity suppressed -> not contactable", () => {
    const supp = new Set([suppressionKey("phone", "628123456789")]);
    expect(isContactableForMarketing([marketingActive], [phone], supp)).toBe(false);
  });

  it("suppression on ANY identity blocks (email suppressed, phone clear)", () => {
    const supp = new Set([suppressionKey("email", "a@b.com")]);
    expect(isContactableForMarketing([marketingActive], [phone, email], supp)).toBe(false);
  });

  it("withdrawn marketing consent -> not contactable", () => {
    expect(isContactableForMarketing([marketingWithdrawn], [phone], new Set())).toBe(false);
  });

  it("only transactional consent -> not contactable (marketing is the gate)", () => {
    expect(isContactableForMarketing([transactionalActive], [phone], new Set())).toBe(false);
  });

  it("suppression of a DIFFERENT identity does not block", () => {
    const supp = new Set([suppressionKey("phone", "620000000000")]);
    expect(isContactableForMarketing([marketingActive], [phone], supp)).toBe(true);
  });

  it("no identities + active marketing consent -> contactable (nothing to suppress)", () => {
    expect(isContactableForMarketing([marketingActive], [], new Set())).toBe(true);
  });

  it("mixed consents: one active marketing among others -> contactable", () => {
    expect(
      isContactableForMarketing([transactionalActive, marketingWithdrawn, marketingActive], [phone], new Set()),
    ).toBe(true);
  });
});

/**
 * The D-2 seam: the WRITE path (prepareIdentity) and the READ path (master_customer's
 * phone_normalized fed to suppressionKey) MUST produce the same canon, or a suppression
 * fails to match silently and a person who asked to stop is still contactable. This test
 * ties the two modules together so a future canon drift breaks a test, not a promise.
 */
describe("write-canon matches contactability lookup (D-2, no silent mismatch)", () => {
  it("a phone suppressed via the write path blocks the same profile's normalized identity", () => {
    // Operator types a messy number on /consent; the write path normalizes it.
    const prepared = prepareIdentity("phone", "0812-3456-789");
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    // The active-suppression set the dashboard builds is keyed the same way.
    const suppSet = new Set([suppressionKey(prepared.identityKind, prepared.identityKey)]);

    // master_customer stores the SAME person under the SAME canon (+62 form here).
    const profilePhone = normalizePhoneID("+62 812 3456 789");
    const identities: Identity[] = [{ kind: "phone", key: profilePhone! }];

    // Even with an active marketing consent, suppression wins — BECAUSE the keys match.
    expect(isContactableForMarketing([marketingActive], identities, suppSet)).toBe(false);
    // Sanity: the two paths really did produce the identical key.
    expect(profilePhone).toBe(prepared.identityKey);
  });
});

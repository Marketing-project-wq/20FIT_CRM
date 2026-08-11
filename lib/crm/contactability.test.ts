import { describe, it, expect } from "vitest";
import {
  isContactableForMarketing,
  suppressionKey,
  type ConsentRow,
  type Identity,
} from "./contactability";

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

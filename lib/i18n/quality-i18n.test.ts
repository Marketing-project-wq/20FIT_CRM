import { describe, it, expect } from "vitest";
import { id } from "./messages/id";
import { en } from "./messages/en";
import {
  FILL_KEYS,
  FILL_WARN_KEYS,
  ISSUE_KEYS,
  SATELLITE_KEYS,
  ARTIFACT_KEYS,
} from "../crm/quality-types";

/**
 * Data-driven /quality translation coverage (Sprint 5B). The dictionary parity test (i18n.test.ts)
 * only proves id ↔ en symmetry; it CANNOT catch a data key that exists in the code (a new fill
 * field, a new defect count, a new verified artifact) but was never given a dictionary entry. If
 * that happens the key-resolver silently falls back to the server's Indonesian string, so an
 * English user would see Indonesian with NO error — exactly the silent mix the coverage marker
 * exists to prevent. This test closes that gap: every /quality data key MUST have a label AND its
 * warning prose in BOTH languages, or the build fails. It is the reason a new /quality row cannot
 * ship half-translated.
 */

const idQ = id.quality as unknown as Record<string, Record<string, string>>;
const enQ = en.quality as unknown as Record<string, Record<string, string>>;

function assertBoth(bucket: string, key: string) {
  const iv = idQ[bucket]?.[key];
  const ev = enQ[bucket]?.[key];
  expect(typeof iv === "string" && iv.length > 0, `id.quality.${bucket}.${key} missing`).toBe(true);
  expect(typeof ev === "string" && ev.length > 0, `en.quality.${bucket}.${key} missing`).toBe(true);
}

describe("/quality data keys are translated in BOTH languages (code ↔ dictionary)", () => {
  describe("fill rows have a label in both languages", () => {
    for (const key of FILL_KEYS) it(`fillLabel.${key}`, () => assertBoth("fillLabel", key));
  });

  describe("fill rows with a note have that warning in both languages", () => {
    for (const key of FILL_WARN_KEYS) it(`warn.fill_${key}`, () => assertBoth("warn", `fill_${key}`));
  });

  describe("issue rows (identifiers/anomalies/duplicates/queues) have label + definition in both", () => {
    for (const key of ISSUE_KEYS) {
      it(`issueLabel.${key}`, () => assertBoth("issueLabel", key));
      it(`warn.issue_${key}`, () => assertBoth("warn", `issue_${key}`));
    }
  });

  describe("satellite rows have label + note in both languages", () => {
    for (const key of SATELLITE_KEYS) {
      it(`satelliteLabel.${key}`, () => assertBoth("satelliteLabel", key));
      it(`warn.satellite_${key}`, () => assertBoth("warn", `satellite_${key}`));
    }
  });

  describe("verified artifacts have label + detail in both languages", () => {
    for (const key of ARTIFACT_KEYS) {
      it(`artifactLabel.${key}`, () => assertBoth("artifactLabel", key));
      it(`warn.artifact_${key}`, () => assertBoth("warn", `artifact_${key}`));
    }
  });
});

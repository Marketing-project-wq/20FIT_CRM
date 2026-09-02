import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { proposeSegment, AiUnavailableError, AiTimeoutError } from "./segment-ai";

/**
 * The LLM call itself (proposeSegment) — focused on the FAILURE contract, which is what the route and
 * UI branch on. The happy path's JSON→criteria mapping is covered by segment-ai-shared.test.ts (the
 * pure sanitizer). Here we only need: a slow model that aborts surfaces as AiTimeoutError (so the UI
 * can say "try again"), and every other failure stays AiUnavailableError (so the manual builder path
 * still catches it). AiTimeoutError extends AiUnavailableError, so the ordering in the route matters —
 * these tests pin that the two are distinguishable.
 */
describe("proposeSegment failure contract", () => {
  const OLD_KEY = process.env.SEGMENT_AI_API_KEY;
  beforeEach(() => {
    process.env.SEGMENT_AI_API_KEY = "sk-or-test";
  });
  afterEach(() => {
    process.env.SEGMENT_AI_API_KEY = OLD_KEY;
    vi.unstubAllGlobals();
  });

  it("maps an AbortError (our timeout) to AiTimeoutError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))),
    );
    await expect(proposeSegment("peserta sportfest", { canViewHealth: false, lang: "id" })).rejects.toBeInstanceOf(
      AiTimeoutError,
    );
  });

  it("maps any other network failure to AiUnavailableError (not a timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));
    const err = await proposeSegment("x", { canViewHealth: false, lang: "id" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(err).not.toBeInstanceOf(AiTimeoutError);
  });

  it("maps a non-OK model response to AiUnavailableError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 502 } as Response)));
    await expect(proposeSegment("x", { canViewHealth: false, lang: "id" })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("throws AiUnavailableError (never reaching fetch) when the API key is missing", async () => {
    delete process.env.SEGMENT_AI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(proposeSegment("x", { canViewHealth: false, lang: "id" })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled(); // a missing key 503s immediately — it never 524s
  });
});

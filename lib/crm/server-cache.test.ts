import { describe, it, expect, vi, beforeEach } from "vitest";
import { cachedAggregate, invalidateCache } from "./server-cache";

describe("cachedAggregate (stale-while-revalidate)", () => {
  beforeEach(() => {
    vi.useRealTimers();
    invalidateCache("");
  });
  it("loads once and serves from memory while fresh", async () => {
    const load = vi.fn(async () => 1);
    expect(await cachedAggregate("k", 1000, load)).toBe(1);
    expect(await cachedAggregate("k", 1000, load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("concurrent first callers share one load", async () => {
    let n = 0;
    const load = () => new Promise<number>((r) => setTimeout(() => r(++n), 10));
    const [a, b] = await Promise.all([cachedAggregate("c", 1000, load), cachedAggregate("c", 1000, load)]);
    expect([a, b]).toEqual([1, 1]);
  });
  it("serves the stale value immediately and refreshes in the background", async () => {
    vi.useFakeTimers();
    let v = 1;
    const load = vi.fn(async () => v);
    await cachedAggregate("s", 100, load);
    v = 2;
    vi.advanceTimersByTime(150);
    expect(await cachedAggregate("s", 100, load)).toBe(1); // stale served, refresh kicked
    await vi.runAllTimersAsync();
    expect(await cachedAggregate("s", 100, load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("a failed refresh keeps the last good value", async () => {
    vi.useFakeTimers();
    let fail = false;
    const load = vi.fn(async () => {
      if (fail) throw new Error("db down");
      return "ok";
    });
    await cachedAggregate("f", 100, load);
    fail = true;
    vi.advanceTimersByTime(150);
    expect(await cachedAggregate("f", 100, load)).toBe("ok");
    await vi.runAllTimersAsync();
    expect(await cachedAggregate("f", 100, load)).toBe("ok");
  });
  it("invalidateCache forces the next read to load", async () => {
    const load = vi.fn(async () => Date.now());
    await cachedAggregate("deliveries", 60_000, load);
    invalidateCache("deliveries");
    await cachedAggregate("deliveries", 60_000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("a first load failure propagates (nothing to serve)", async () => {
    await expect(cachedAggregate("e", 1000, async () => { throw new Error("x"); })).rejects.toThrow("x");
  });
});

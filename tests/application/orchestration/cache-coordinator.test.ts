import { describe, expect, it } from "vitest";

import { CacheCoordinator } from "@/src/application/orchestration";
import { InMemoryCache } from "@/src/infrastructure/cache";

import { MutableClock } from "./fixtures";

describe("B6 cache coordinator", () => {
  it("supports miss, hit, expiration, disclosed stale fallback, and final expiry", async () => {
    const clock = new MutableClock();
    const cache = new InMemoryCache(clock);
    const coordinator = new CacheCoordinator(cache, clock);
    let calls = 0;
    let failing = false;
    const request = () =>
      coordinator.load({
        key: "safe-key",
        tags: ["source:shopify"],
        policy: { freshForSeconds: 10, staleForSeconds: 20 },
        load: async () => {
          calls += 1;
          if (failing) throw new Error("sanitized outage");
          return { value: { total: 7 }, cacheable: true };
        },
      });

    expect((await request()).cache.state).toBe("miss");
    expect((await request()).cache.state).toBe("hit");
    expect(calls).toBe(1);

    clock.advance(11_000);
    failing = true;
    const stale = await request();
    expect(stale.cache.state).toBe("stale");
    expect(stale.value).toEqual({ total: 7 });

    clock.advance(20_000);
    await expect(request()).rejects.toThrow("sanitized outage");
  });

  it("coalesces concurrent misses and supports tag invalidation and bypass", async () => {
    const clock = new MutableClock();
    const cache = new InMemoryCache(clock);
    const coordinator = new CacheCoordinator(cache, clock);
    let calls = 0;
    const load = async () => {
      calls += 1;
      await Promise.resolve();
      return { value: calls, cacheable: true };
    };
    const input = {
      key: "coalesced",
      tags: ["dataset:catalog"],
      policy: { freshForSeconds: 60, staleForSeconds: 0 },
      load,
    } as const;

    const first = await Promise.all([coordinator.load(input), coordinator.load(input)]);
    expect(first.map(({ value }) => value)).toEqual([1, 1]);
    expect(calls).toBe(1);

    await coordinator.invalidate(["dataset:catalog"]);
    expect((await coordinator.load(input)).cache.state).toBe("miss");
    expect(calls).toBe(2);

    const bypass = await coordinator.load({ ...input, bypass: true });
    expect(bypass.cache.state).toBe("bypass");
    expect(calls).toBe(3);
  });

  it("never replaces a last-known-good entry with an invalid refresh", async () => {
    const clock = new MutableClock();
    const coordinator = new CacheCoordinator(new InMemoryCache(clock), clock);
    let valid = true;
    const request = () =>
      coordinator.load({
        key: "validated-only",
        tags: ["source:google_sheets"],
        policy: { freshForSeconds: 1, staleForSeconds: 30 },
        load: async () => ({ value: valid ? "valid" : "invalid", cacheable: valid }),
      });
    await request();
    clock.advance(2_000);
    valid = false;
    expect(await request()).toMatchObject({ value: "valid", cache: { state: "stale" } });
  });

  it("bounds process memory with configurable oldest-entry eviction", async () => {
    const clock = new MutableClock();
    const cache = new InMemoryCache(clock, 2);
    const policy = { freshForSeconds: 60, staleForSeconds: 0 };
    await cache.set("first", 1, policy, ["one"]);
    await cache.set("second", 2, policy, ["two"]);
    await cache.set("third", 3, policy, ["three"]);
    expect(await cache.get("first")).toBeNull();
    expect(await cache.get("second")).not.toBeNull();
    expect(await cache.get("third")).not.toBeNull();
  });
});

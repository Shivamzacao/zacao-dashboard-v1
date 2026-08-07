import type { CacheEntry, CachePort, ClockPort } from "@/src/application/ports";
import type { CachePolicy } from "@/src/domain/contracts";

export class InMemoryCache implements CachePort {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly clock: ClockPort,
    private readonly maxEntries = 500,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new TypeError("Cache capacity must be a positive integer");
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.parse(entry.staleUntil) <= this.clock.now().getTime()) {
      this.entries.delete(key);
      return null;
    }
    return entry as CacheEntry<T>;
  }

  async set<T>(key: string, value: T, policy: CachePolicy, tags: readonly string[]): Promise<void> {
    const generatedAt = this.clock.now();
    const expiresAt = new Date(generatedAt.getTime() + policy.freshForSeconds * 1000);
    const staleUntil = new Date(expiresAt.getTime() + policy.staleForSeconds * 1000);
    if (this.entries.has(key)) this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, {
      value,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      staleUntil: staleUntil.toISOString(),
      tags: [...new Set(tags)],
    });
  }

  async invalidate(tags: readonly string[]): Promise<void> {
    if (tags.length === 0) return;
    const requested = new Set(tags);
    for (const [key, entry] of this.entries) {
      if (entry.tags.some((tag) => requested.has(tag))) this.entries.delete(key);
    }
  }
}

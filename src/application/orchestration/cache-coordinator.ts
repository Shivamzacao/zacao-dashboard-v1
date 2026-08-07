import type { CachePort, ClockPort } from "@/src/application/ports";
import { cacheMetadataSchema, type CacheMetadata, type CachePolicy } from "@/src/domain/contracts";

export interface CachedLoadResult<T> {
  readonly value: T;
  readonly cache: CacheMetadata;
}

interface LoadValue<T> {
  readonly value: T;
  readonly cacheable: boolean;
}

export class CacheCoordinator {
  private readonly inFlight = new Map<string, Promise<LoadValue<unknown>>>();

  constructor(
    private readonly cache: CachePort,
    private readonly clock: ClockPort,
  ) {}

  async invalidate(tags: readonly string[]): Promise<void> {
    await this.cache.invalidate(tags);
  }

  async load<T>(input: {
    readonly key: string;
    readonly tags: readonly string[];
    readonly policy: CachePolicy;
    readonly bypass?: boolean;
    readonly load: () => Promise<LoadValue<T>>;
  }): Promise<CachedLoadResult<T>> {
    const now = this.clock.now();
    const nowMs = now.getTime();
    if (input.bypass) {
      const loaded = await input.load();
      return {
        value: loaded.value,
        cache: cacheMetadataSchema.parse({
          state: "bypass",
          generatedAt: now.toISOString(),
          expiresAt: null,
        }),
      };
    }

    const cached = await this.cache.get<T>(input.key);
    if (cached && Date.parse(cached.expiresAt) > nowMs) {
      return {
        value: cached.value,
        cache: cacheMetadataSchema.parse({
          state: "hit",
          generatedAt: cached.generatedAt,
          expiresAt: cached.expiresAt,
        }),
      };
    }

    const stale = cached && Date.parse(cached.staleUntil) > nowMs ? cached : null;
    try {
      const loaded = await this.coalesced(input.key, input.load);
      if (!loaded.cacheable && stale) return this.stale(stale);
      if (loaded.cacheable) {
        await this.cache.set(input.key, loaded.value, input.policy, input.tags);
      }
      return {
        value: loaded.value,
        cache: cacheMetadataSchema.parse({
          state: "miss",
          generatedAt: now.toISOString(),
          expiresAt: loaded.cacheable
            ? new Date(nowMs + input.policy.freshForSeconds * 1000).toISOString()
            : null,
        }),
      };
    } catch (error) {
      if (stale) return this.stale(stale);
      throw error;
    }
  }

  private async coalesced<T>(
    key: string,
    load: () => Promise<LoadValue<T>>,
  ): Promise<LoadValue<T>> {
    const existing = this.inFlight.get(key) as Promise<LoadValue<T>> | undefined;
    if (existing) return existing;
    const operation = load().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation as Promise<LoadValue<unknown>>);
    return operation;
  }

  private stale<T>(entry: {
    readonly value: T;
    readonly generatedAt: string;
    readonly expiresAt: string;
  }): CachedLoadResult<T> {
    return {
      value: entry.value,
      cache: cacheMetadataSchema.parse({
        state: "stale",
        generatedAt: entry.generatedAt,
        expiresAt: entry.expiresAt,
      }),
    };
  }
}

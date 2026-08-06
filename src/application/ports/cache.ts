import type { CachePolicy } from "@/src/domain/contracts";

export interface CacheEntry<T> {
  readonly value: T;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly staleUntil: string;
}

export interface CachePort {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, policy: CachePolicy): Promise<void>;
  invalidate(tags: readonly string[]): Promise<void>;
}

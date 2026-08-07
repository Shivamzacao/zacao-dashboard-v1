import type { DashboardFilters } from "../contracts";
import { CONTRACT_SCHEMA_VERSION } from "../contracts";
import { normalizeDashboardFilters } from "./filters";

export function createDashboardCacheKey(namespace: string, filters: DashboardFilters): string {
  const normalizedNamespace = namespace.trim();
  if (!/^[a-z][a-z0-9:_-]*$/.test(normalizedNamespace)) {
    throw new TypeError("Cache namespace must use lowercase stable characters");
  }

  const normalized = normalizeDashboardFilters(filters);
  return [
    normalizedNamespace,
    `schema=${CONTRACT_SCHEMA_VERSION}`,
    `start=${normalized.startDate}`,
    `end=${normalized.endDate}`,
    `comparison=${normalized.comparison}`,
    `channels=${normalized.channels.map(encodeURIComponent).join(",")}`,
    `skus=${normalized.productSkus.map(encodeURIComponent).join(",")}`,
    `locations=${normalized.locations.map(encodeURIComponent).join(",")}`,
  ].join(":");
}

export function createDatasetCacheKey(input: {
  readonly environment: "test" | "production";
  readonly source: string;
  readonly sourceIdentity: string;
  readonly dataset: string;
  readonly filters: DashboardFilters;
}): string {
  const stableHash = (value: string): string => {
    let hash = 0xcbf29ce484222325n;
    for (const character of value) {
      hash ^= BigInt(character.codePointAt(0) ?? 0);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, "0");
  };
  const stablePart = (label: string, value: string): string => {
    const normalized = value.trim();
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(normalized)) {
      throw new TypeError(`${label} must be a non-secret stable identifier`);
    }
    return normalized;
  };

  const source = stablePart("Cache source", input.source);
  const identity = stablePart("Cache source identity", input.sourceIdentity);
  const dataset = stablePart("Cache dataset", input.dataset);
  return createDashboardCacheKey(
    `zacao:v1:${input.environment}:${source}:id-${stableHash(identity)}:${dataset}:metric-v1`,
    input.filters,
  );
}

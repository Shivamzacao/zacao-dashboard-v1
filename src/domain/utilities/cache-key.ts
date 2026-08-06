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

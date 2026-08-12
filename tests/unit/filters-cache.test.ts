import { describe, expect, it } from "vitest";

import type { DashboardFilters } from "@/src/domain/contracts";
import { createDashboardCacheKey } from "@/src/domain/utilities/cache-key";
import { normalizeDashboardFilters } from "@/src/domain/utilities/filters";

const filters: DashboardFilters = {
  startDate: "2025-08-06",
  endDate: "2026-08-06",
  channels: ["Wholesale/Faire", " Website/DTC ", "Website/DTC"],
  productSkus: ["DARK-1", "SMOOTH-4"],
  locations: ["SNAPL"],
};

describe("filter normalization and cache keys", () => {
  it("trims, removes blanks and duplicates, and sorts multiselect filters", () => {
    expect(
      normalizeDashboardFilters({ ...filters, channels: [...filters.channels, " "] }).channels,
    ).toEqual(["Website/DTC", "Wholesale/Faire"]);
  });

  it("creates the same key for semantically identical filters", () => {
    const reordered = { ...filters, channels: [...filters.channels].reverse() };
    expect(createDashboardCacheKey("dashboard:revenue", filters)).toBe(
      createDashboardCacheKey("dashboard:revenue", reordered),
    );
  });

  it("escapes filter values in a stable key", () => {
    const key = createDashboardCacheKey("dashboard:revenue", {
      ...filters,
      channels: ["DTC / Web"],
    });
    expect(key).toContain("channels=DTC%20%2F%20Web");
    expect(key).toContain("schema=1.0");
    expect(key).not.toContain("comparison=");
  });

  it.each(["", "Revenue Page", "UPPER"])("rejects unstable namespace %s", (namespace) => {
    expect(() => createDashboardCacheKey(namespace, filters)).toThrow(TypeError);
  });
});
